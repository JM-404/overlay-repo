#
# This file is part of TEN Framework, an open source project.
# Licensed under the Apache License, Version 2.0.
# See the LICENSE file for more information.
#
import asyncio
import json
import time
import uuid
from pathlib import Path
from ten_runtime import (
    AudioFrame,
    VideoFrame,
    AsyncExtension,
    AsyncTenEnv,
    Cmd,
    StatusCode,
    CmdResult,
    Data,
    AudioFrameDataFmt,
)
from ten_ai_base.const import CMD_PROPERTY_RESULT

from .config import WebSocketServerConfig
from .websocket_server import WebSocketServerManager, AudioData

# Phase 1 (xiaoling-desktop relay): tools whose execution is forwarded to the
# connected client via WebSocket. The server-side LLMExec registers these in
# its in-process tool registry with source="websocket_server", so the existing
# tool dispatch path lands here. We then proxy the call out over the WS, wait
# for the client's `client_tool_call_result`, and return it as the cmd result.
CLIENT_RELAY_TOOLS = {"read_file", "run_command"}
RELAY_TIMEOUT_SEC = 30.0


class WebsocketServerExtension(AsyncExtension):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.config: WebSocketServerConfig = None
        self.ws_server: WebSocketServerManager = None
        self.dump_file = None
        self.dump_bytes_written = 0
        self.ten_env: AsyncTenEnv = None
        # Pending relay calls keyed by request id.
        self._pending_relays: dict[str, asyncio.Future] = {}

    async def on_init(self, ten_env: AsyncTenEnv) -> None:
        # Store ten_env for later use
        self.ten_env = ten_env

        ten_env.log_info("WebSocket Server Extension initializing...")

        # Load configuration from property.json
        try:
            config_json, _ = await ten_env.get_property_to_json("")
            self.config = WebSocketServerConfig.model_validate_json(config_json)
            self.config.validate_config()

            ten_env.log_info(f"Loaded config: {self.config.to_str()}")
        except Exception as e:
            ten_env.log_error(f"Failed to load configuration: {e}")
            raise

        # Initialize dump file if enabled
        if self.config.dump:
            try:
                dump_path = Path(self.config.dump_path)
                dump_path.parent.mkdir(parents=True, exist_ok=True)
                self.dump_file = open(dump_path, "wb")
                self.dump_bytes_written = 0
                ten_env.log_info(f"Audio dump enabled: {dump_path}")
            except Exception as e:
                ten_env.log_error(f"Failed to open dump file: {e}")
                self.dump_file = None

    async def on_start(self, ten_env: AsyncTenEnv) -> None:
        ten_env.log_info("WebSocket Server Extension starting...")

        # Create and start WebSocket server
        try:
            self.ws_server = WebSocketServerManager(
                host=self.config.host,
                port=self.config.port,
                ten_env=ten_env,
                on_audio_callback=self._on_audio_received,
                on_text_callback=self._on_text_received,
                on_relay_result_callback=self._on_relay_result_received,
            )
            await self.ws_server.start()
            ten_env.log_info(
                f"WebSocket server listening on ws://{self.config.host}:{self.config.port}"
            )
        except Exception as e:
            ten_env.log_error(f"Failed to start WebSocket server: {e}")
            raise

    async def on_stop(self, ten_env: AsyncTenEnv) -> None:
        ten_env.log_info("WebSocket Server Extension stopping...")

        # Stop WebSocket server
        if self.ws_server:
            await self.ws_server.stop()
            self.ws_server = None

        # Close dump file
        if self.dump_file:
            try:
                self.dump_file.close()
                ten_env.log_info("Audio dump file closed")
            except Exception as e:
                ten_env.log_error(f"Error closing dump file: {e}")
            finally:
                self.dump_file = None

    async def on_deinit(self, ten_env: AsyncTenEnv) -> None:
        ten_env.log_info("WebSocket Server Extension deinitializing...")

    async def on_cmd(self, ten_env: AsyncTenEnv, cmd: Cmd) -> None:
        """
        Handle command messages from TEN graph
        Forward to WebSocket clients as JSON
        """
        cmd_name = cmd.get_name()
        ten_env.log_debug(f"Received command: {cmd_name}")

        # Phase 1 relay: tool_call cmds for client-side tools are forwarded
        # to the connected WS client (the Tauri shell), which executes them
        # against the local MCP sidecar and replies. We block here until the
        # reply arrives or we time out.
        if cmd_name == "tool_call":
            try:
                payload_json, _ = cmd.get_property_to_json(None)
                payload = json.loads(payload_json) if payload_json else {}
                tool_name = payload.get("name")
                arguments = payload.get("arguments") or {}
                if tool_name in CLIENT_RELAY_TOOLS:
                    llm_result = await self._relay_tool_call_to_client(
                        tool_name, arguments
                    )
                    cmd_result = CmdResult.create(StatusCode.OK, cmd)
                    cmd_result.set_property_from_json(
                        CMD_PROPERTY_RESULT, json.dumps(llm_result)
                    )
                    await ten_env.return_result(cmd_result)
                    return
            except Exception as exc:  # noqa: BLE001
                ten_env.log_error(f"relay tool_call failed: {exc}")
                err_result = {
                    "type": "llmresult",
                    "content": f"Local tool relay failed: {exc}",
                }
                cmd_result = CmdResult.create(StatusCode.OK, cmd)
                cmd_result.set_property_from_json(
                    CMD_PROPERTY_RESULT, json.dumps(err_result)
                )
                await ten_env.return_result(cmd_result)
                return
            # Fall through for non-relay tool_calls (none expected today, but
            # be safe and let the generic broadcast path run).

        try:
            # Convert command to JSON
            cmd_json = cmd.to_json()
            cmd_data = json.loads(cmd_json)

            # Broadcast to all WebSocket clients
            if self.ws_server:
                message = {"type": "cmd", "name": cmd_name, "data": cmd_data}
                await self.ws_server.broadcast(message)
                ten_env.log_debug(
                    f"Broadcasted command {cmd_name} to WebSocket clients"
                )

        except Exception as e:
            ten_env.log_error(
                f"Error forwarding command to WebSocket clients: {e}"
            )

        # Return success
        cmd_result = CmdResult.create(StatusCode.OK, cmd)
        await ten_env.return_result(cmd_result)

    async def _relay_tool_call_to_client(
        self, tool: str, args: dict
    ) -> dict:
        """Send a `client_tool_call` over the WS and await the reply.

        Returns an `LLMToolResult`-shaped dict (`{type: "llmresult", content}`)
        suitable for the existing dispatch loop in `llm_exec.py`.
        """
        if not self.ws_server:
            return {
                "type": "llmresult",
                "content": "WebSocket server not running; cannot relay tool call.",
            }

        request_id = uuid.uuid4().hex
        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()
        self._pending_relays[request_id] = future

        message = {
            "type": "cmd",
            "name": "client_tool_call",
            "data": {"id": request_id, "tool": tool, "args": args},
        }
        try:
            await self.ws_server.broadcast(message)
            self.ten_env.log_info(
                f"relay → {tool} (id={request_id[:8]}) args={args}"
            )
        except Exception:
            self._pending_relays.pop(request_id, None)
            raise

        try:
            mcp_result = await asyncio.wait_for(
                future, timeout=RELAY_TIMEOUT_SEC
            )
        except asyncio.TimeoutError:
            self._pending_relays.pop(request_id, None)
            return {
                "type": "llmresult",
                "content": (
                    f"Local tool '{tool}' timed out after "
                    f"{int(RELAY_TIMEOUT_SEC)}s. The desktop app may not be "
                    f"running, or the user did not approve the call."
                ),
            }

        # mcp_result shape (from frontend bridge):
        #   { ok: bool, content?: [{type, text}], isError?: bool, error?: str }
        text_parts: list[str] = []
        for block in (mcp_result.get("content") or []):
            if isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text")
                if isinstance(t, str):
                    text_parts.append(t)
        if not text_parts and mcp_result.get("error"):
            text_parts.append(str(mcp_result["error"]))

        text = "\n".join(text_parts) if text_parts else json.dumps(mcp_result)
        if mcp_result.get("isError") or not mcp_result.get("ok", True):
            text = f"Error from local tool: {text}"

        self.ten_env.log_info(
            f"relay ← {tool} (id={request_id[:8]}) {len(text)} chars"
        )
        return {"type": "llmresult", "content": text}

    async def _on_relay_result_received(self, data: dict) -> None:
        """Callback fired by WebSocketServerManager when a client posts a
        `client_tool_call_result` message. Resolves the matching future."""
        request_id = data.get("id")
        if not request_id:
            self.ten_env.log_warn(
                f"client_tool_call_result without id: {data}"
            )
            return
        future = self._pending_relays.pop(request_id, None)
        if future is None:
            self.ten_env.log_warn(
                f"client_tool_call_result for unknown id {request_id[:8]}"
            )
            return
        if not future.done():
            future.set_result(data)

    async def on_data(self, ten_env: AsyncTenEnv, data: Data) -> None:
        """
        Handle data messages from TEN graph (e.g., ASR results, LLM responses)
        Forward to WebSocket clients as JSON
        """
        data_name = data.get_name()
        ten_env.log_debug(f"Received data: {data_name}")
        try:
            if data_name == "text_data":
                # Convert data to JSON
                data_json, _ = data.get_property_to_json(None)
                ten_env.log_info(f"Data: {data_json}")
                data_dict = json.loads(data_json)

                # Broadcast to all WebSocket clients
                if self.ws_server:
                    message = {
                        "type": "data",
                        "name": data_name,
                        "data": data_dict,
                    }
                    await self.ws_server.broadcast(message)
                    ten_env.log_debug(
                        f"Broadcasted data {data_name} to WebSocket clients"
                    )

        except Exception as e:
            ten_env.log_error(
                f"Error forwarding data to WebSocket clients: {e}"
            )

    async def on_audio_frame(
        self, ten_env: AsyncTenEnv, audio_frame: AudioFrame
    ) -> None:
        """
        Handle audio frames from TEN graph (e.g., TTS output)
        Sends audio to WebSocket clients as base64-encoded JSON
        """
        audio_frame_name = audio_frame.get_name()
        ten_env.log_debug(f"Received audio frame: {audio_frame_name}")

        if not self.ws_server:
            ten_env.log_warn(
                "WebSocket server not initialized, dropping audio frame"
            )
            return

        try:
            # Get PCM data from audio frame
            buf = audio_frame.lock_buf()
            pcm_data = bytes(buf)
            audio_frame.unlock_buf(buf)

            # Extract metadata if present
            metadata = {}
            try:
                metadata_json = audio_frame.get_property_string("metadata")
                if metadata_json:
                    metadata = json.loads(metadata_json)
            except Exception:
                # No metadata or invalid JSON, continue without it
                pass

            # Add audio properties to metadata
            metadata.update(
                {
                    "sample_rate": audio_frame.get_sample_rate(),
                    "channels": audio_frame.get_number_of_channels(),
                    "bytes_per_sample": audio_frame.get_bytes_per_sample(),
                    "samples_per_channel": audio_frame.get_samples_per_channel(),
                }
            )

            # Send to WebSocket clients
            await self.ws_server.send_audio_to_clients(pcm_data, metadata)

            ten_env.log_debug(
                f"Forwarded {len(pcm_data)} bytes of audio to WebSocket clients"
            )

        except Exception as e:
            ten_env.log_error(
                f"Error processing audio frame for WebSocket: {e}"
            )

    async def on_video_frame(
        self, ten_env: AsyncTenEnv, video_frame: VideoFrame
    ) -> None:
        """Handle video frames (not typically used for this extension)"""
        video_frame_name = video_frame.get_name()
        ten_env.log_debug(f"Received video frame: {video_frame_name}")

    async def _on_text_received(self, text: str, client_id: str) -> None:
        """
        Callback when a text message is received from the WebSocket client.
        Emits a synthetic `asr_result` data frame into the graph so the rest
        of the pipeline (main_control → llm → tts) treats it identically to
        voice input. Used by the text-input UI to let users type messages
        without speaking.
        """
        try:
            ten_env = self.ten_env
            text = (text or "").strip()
            if not text:
                return

            payload = {
                "id": f"text-{uuid.uuid4().hex[:12]}",
                "text": text,
                "final": True,
                "start_ms": int(time.time() * 1000),
                "duration_ms": 0,
                "language": "zh-CN",
                "words": [],
                "metadata": {"client_id": client_id, "source": "text_input"},
            }

            data = Data.create("asr_result")
            data.set_property_from_json(None, json.dumps(payload))
            await ten_env.send_data(data)

            ten_env.log_info(
                f"Forwarded text as asr_result: {text!r}"
            )
        except Exception as e:
            self.ten_env.log_error(
                f"Error forwarding text input to graph: {e}"
            )

    async def _on_audio_received(self, audio_data: AudioData) -> None:
        """
        Callback when audio data is received from WebSocket client
        Creates AudioFrame and sends it to TEN graph

        Args:
            audio_data: Audio data container with PCM data and metadata
        """
        try:
            # Get ten_env (stored during initialization)
            ten_env = self.ten_env

            # Dump audio if enabled
            if self.dump_file:
                try:
                    self.dump_file.write(audio_data.pcm_data)
                    self.dump_bytes_written += len(audio_data.pcm_data)
                    # Truncate when exceeding configured max size
                    if self.dump_bytes_written >= self.config.dump_max_bytes:
                        self.dump_file.flush()
                        self.dump_file.close()
                        # Reopen same path in write mode to truncate
                        dump_path = Path(self.config.dump_path)
                        self.dump_file = open(dump_path, "wb")
                        self.dump_bytes_written = 0
                        ten_env.log_info(
                            f"Audio dump truncated after reaching {self.config.dump_max_bytes} bytes"
                        )
                    else:
                        self.dump_file.flush()
                except Exception as e:
                    ten_env.log_error(f"Error writing dump file: {e}")

            # Create AudioFrame
            audio_frame = AudioFrame.create("pcm_frame")

            # Set fixed audio properties (16kHz mono 16-bit PCM)
            audio_frame.set_sample_rate(self.config.sample_rate)
            audio_frame.set_bytes_per_sample(self.config.bytes_per_sample)
            audio_frame.set_number_of_channels(self.config.channels)
            audio_frame.set_data_fmt(AudioFrameDataFmt.INTERLEAVE)

            # Calculate number of samples
            bytes_per_frame = (
                self.config.bytes_per_sample * self.config.channels
            )
            samples_per_channel = len(audio_data.pcm_data) // bytes_per_frame
            audio_frame.set_samples_per_channel(samples_per_channel)

            # Allocate and fill buffer
            audio_frame.alloc_buf(len(audio_data.pcm_data))
            buf = audio_frame.lock_buf()
            buf[:] = audio_data.pcm_data
            audio_frame.unlock_buf(buf)

            # Attach metadata if present
            if audio_data.metadata:
                metadata_json = json.dumps(audio_data.metadata)
                audio_frame.set_property_from_json("metadata", metadata_json)

            # Send audio frame to TEN graph
            await ten_env.send_audio_frame(audio_frame)

            ten_env.log_debug(
                f"Sent audio frame from {audio_data.client_id}: "
                f"{len(audio_data.pcm_data)} bytes, {samples_per_channel} samples"
            )

        except Exception as e:
            ten_env.log_error(f"Error processing audio from WebSocket: {e}")
            raise
