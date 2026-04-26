"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Send,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsPortrait } from "@/hooks/useIsPortrait";
import { getSelectedModel, setSelectedModel } from "@/lib/availableModels";
import { buildTickPayload, readGreetOverride } from "@/lib/proactiveTick";
import { resolveBackgroundCss, useSettings } from "@/lib/settingsStore";
import { AudioControls } from "@/components/Agent/AudioControls";
import { AudioVisualizer } from "@/components/Agent/AudioVisualizer";
import { AvatarLive2D } from "@/components/Agent/AvatarLive2D";
import { ChatHistory } from "@/components/Agent/ChatHistory";
import { ConnectionStatus } from "@/components/Agent/ConnectionStatus";
import { SettingsDrawer } from "@/components/Agent/SettingsDrawer";
import { TranscriptionDisplay } from "@/components/Agent/TranscriptionDisplay";
import { UserCamera } from "@/components/Agent/UserCamera";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAgentLifecycle } from "@/hooks/useAgentLifecycle";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useWebSocket } from "@/hooks/useWebSocket";
import { getOrGeneratePort, getWebSocketUrl } from "@/lib/portManager";
import { useAgentStore } from "@/store/agentStore";

export function WebSocketClient() {
  const [port, setPort] = useState<number | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    setPort(getOrGeneratePort());
  }, []);

  // Model selector — persists to localStorage, takes effect on next Start.
  const [modelId, setModelId] = useState<string>(() => getSelectedModel());
  const handleModelChange = (id: string) => {
    setModelId(id);
    setSelectedModel(id);
  };

  const {
    state: agentState,
    startAgent,
    stopAgent,
    reset,
    isStarting,
    isRunning,
  } = useAgentLifecycle();

  const {
    wsManager,
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
  } = useWebSocket({
    url: port ? getWebSocketUrl(port) : "ws://localhost:8765",
    autoConnect: false,
    maxReconnectAttempts: -1,
    reconnectInterval: 3000,
  });

  const { isRecording, startRecording, stopRecording, getMediaStream } =
    useAudioRecorder(wsManager);
  // Pull setVolume so the SettingsDrawer can drive master TTS volume.
  const { analyser: ttsAnalyser, setVolume: setPlaybackVolume } =
    useAudioPlayer(wsManager);
  const handleVoiceVolumeChange = useCallback(
    (v: number) => setPlaybackVolume(v),
    [setPlaybackVolume],
  );
  const { wsConnected } = useAgentStore();

  // Persistent UI settings (background, volume, avatar). Background gets
  // applied via inline style on the outermost container.
  const [settings] = useSettings();

  // Portrait layout: chat collapses to ~33% of available height by default,
  // tap header to expand to ~80%. State only meaningful in portrait, but
  // safe to keep in landscape as well.
  const isPortrait = useIsPortrait();
  const [chatExpanded, setChatExpanded] = useState(false);

  useEffect(() => {
    startRecording().catch((err) =>
      console.error("Failed to auto-start recording:", err),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRecording]);

  // Fire a proactive tick the moment the WebSocket connects so 小灵 opens
  // first instead of waiting for the user to speak. The tick reason comes
  // from the URL (?greet=morning|afternoon|evening|remind) when set, else
  // defaults to user_just_arrived.
  //
  // Keyed on `channelName` (one new value per Start click) so that
  // mid-session reconnects, React StrictMode double-effect-runs in dev,
  // and any other wsConnected flip-flops do NOT re-trigger the greeting.
  // Each Start = exactly one greeting, period.
  const lastFiredChannelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wsConnected || !wsManager) return;
    const channel = agentState.channelName;
    if (!channel) return;
    if (lastFiredChannelRef.current === channel) return;
    lastFiredChannelRef.current = channel;
    const reason = readGreetOverride() ?? "user_just_arrived";
    try {
      wsManager.send(buildTickPayload(reason));
    } catch (err) {
      console.error("Failed to send proactive tick:", err);
    }
  }, [wsConnected, wsManager, agentState.channelName]);

  const handleStartAgent = async () => {
    if (!port) {
      setInitError("Port not available");
      return;
    }
    setInitError(null);
    try {
      await startAgent({ port });
      setTimeout(() => connectWebSocket(), 2000);
    } catch (error) {
      setInitError(
        error instanceof Error ? error.message : "Failed to start agent",
      );
    }
  };

  // Text-input handling. Sends {"text": "..."} over the same WebSocket the
  // mic uses; server-side websocket_server patch turns it into an asr_result
  // event so the rest of the pipeline is unchanged.
  const [textInput, setTextInput] = useState("");
  const sendTextMessage = () => {
    const trimmed = textInput.trim();
    if (!trimmed || !wsConnected || !wsManager) return;
    try {
      wsManager.send({ text: trimmed });
      setTextInput("");
    } catch (err) {
      console.error("Failed to send text message:", err);
    }
  };

  const handleStopAgent = async () => {
    try {
      disconnectWebSocket();
      await stopAgent();
      setInitError(null);
      reset();
    } catch {
      setInitError(null);
      reset();
    }
  };

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: resolveBackgroundCss(settings.background) }}
    >
      <div className="flex h-full flex-col bg-background/70 backdrop-blur-sm">
        {/* Top toolbar: title + connection status + start/stop + mic + settings */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
          <h1 className="font-semibold text-foreground text-lg tracking-tight">
            小灵
          </h1>
          <ConnectionStatus />
          <div className="ml-auto flex items-center gap-2">
            <SettingsDrawer
              modelId={modelId}
              onModelChange={handleModelChange}
              modelLocked={isRunning || isStarting}
              onVoiceVolumeChange={handleVoiceVolumeChange}
            />
            {!isRunning && !isStarting && (
              <Button
                onClick={handleStartAgent}
                disabled={!port}
                size="sm"
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Start
              </Button>
            )}
            {isStarting && (
              <Button disabled size="sm" className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </Button>
            )}
            {isRunning && (
              <Button
                onClick={handleStopAgent}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}
            <AudioControls
              isRecording={isRecording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
            />
          </div>
        </div>

        {/* Error alert (only when present) */}
        {(initError || agentState.error) && (
          <div className="shrink-0 px-4 pt-3">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>
                {initError || agentState.error}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Main area: portrait (vertical stack with collapsible chat) vs
            landscape (current 2-column). Both share the toolbar + alert
            above. */}
        {isPortrait ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 gap-2">
            {/* Avatar zone — shrinks when chat is expanded, with user-cam PiP overlay */}
            <div
              className={`relative min-h-0 overflow-hidden rounded-xl shadow-sm transition-[flex-basis] duration-300 ease-out ${
                chatExpanded ? "basis-[20%]" : "basis-[60%]"
              } flex-grow-0 flex-shrink-0`}
            >
              <Card className="flex h-full flex-col overflow-hidden">
                <CardContent className="flex-1 p-2">
                  <AvatarLive2D analyser={ttsAnalyser} />
                </CardContent>
              </Card>
              {/* User camera as floating tile, top-right of avatar area */}
              <div className="pointer-events-none absolute right-3 top-3 h-20 w-20 overflow-hidden rounded-lg ring-2 ring-black/40">
                <UserCamera />
              </div>
            </div>

            {/* Mic visualizer strip — always visible thin band */}
            <div
              className="relative shrink-0 overflow-hidden rounded-xl border border-border/30 bg-muted/30 ring-1 ring-border/40"
              style={{ height: 32 }}
            >
              <AudioVisualizer
                stream={getMediaStream()}
                isActive={isRecording}
                barCount={28}
                barWidth={3}
                barGap={2}
                height={32}
              />
            </div>

            {/* Chat — collapsed (~33%) by default, expands to ~80% on tap */}
            <Card
              className={`flex min-h-0 flex-col overflow-hidden shadow-sm transition-[flex-basis] duration-300 ease-out ${
                chatExpanded ? "basis-[78%]" : "basis-[33%]"
              } flex-grow flex-shrink`}
            >
              <button
                type="button"
                onClick={() => setChatExpanded((v) => !v)}
                className="flex w-full shrink-0 items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/30"
                aria-label={chatExpanded ? "收起对话" : "展开对话"}
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Conversation</span>
                  {isRunning && wsConnected && (
                    <span className="text-muted-foreground text-xs">
                      {isRecording ? "Listening…" : "点击展开 / 收起"}
                    </span>
                  )}
                </div>
                {chatExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-0">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ChatHistory />
                </div>
                <TranscriptionDisplay />
                <div className="flex shrink-0 items-center gap-2 border-t border-border/30 pt-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendTextMessage();
                      }
                    }}
                    onFocus={() => setChatExpanded(true)}
                    placeholder={
                      wsConnected ? "输入消息,按回车…" : "先 Start"
                    }
                    disabled={!wsConnected}
                    className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    onClick={sendTextMessage}
                    disabled={!wsConnected || !textInput.trim()}
                    className="gap-1"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Landscape: avatar+cam stacked left, chat on right */
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(260px,1fr)_2fr]">
            <div className="flex min-h-0 flex-col gap-3">
              <Card className="flex flex-1 flex-col overflow-hidden shadow-sm">
                <CardContent className="flex-1 p-2">
                  <AvatarLive2D analyser={ttsAnalyser} />
                </CardContent>
              </Card>
              <div
                className="relative overflow-hidden rounded-xl border border-border/30 bg-muted/30 ring-1 ring-border/40"
                style={{ height: 40 }}
              >
                <AudioVisualizer
                  stream={getMediaStream()}
                  isActive={isRecording}
                  barCount={32}
                  barWidth={3}
                  barGap={2}
                  height={40}
                />
              </div>
              <Card className="flex flex-1 flex-col overflow-hidden shadow-sm">
                <CardContent className="flex-1 p-2">
                  <UserCamera />
                </CardContent>
              </Card>
            </div>

            <Card className="flex min-h-0 flex-col overflow-hidden shadow-sm">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="text-base">Conversation</CardTitle>
                {isRunning && wsConnected && (
                  <div className="text-muted-foreground text-xs">
                    {isRecording ? "Listening…" : "Click the mic to speak"}
                  </div>
                )}
                {isRunning && !wsConnected && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Connecting…</span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pb-3 pt-0">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ChatHistory />
                </div>
                <TranscriptionDisplay />
                <div className="flex shrink-0 items-center gap-2 border-t border-border/30 pt-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendTextMessage();
                      }
                    }}
                    placeholder={
                      wsConnected ? "输入消息,按回车发送…" : "先 Start 再输入"
                    }
                    disabled={!wsConnected}
                    className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    onClick={sendTextMessage}
                    disabled={!wsConnected || !textInput.trim()}
                    className="gap-1"
                  >
                    <Send className="h-4 w-4" />
                    发送
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
