import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WebSocket Voice Assistant",
  description:
    "Real-time voice assistant powered by WebSocket, Deepgram STT, OpenAI LLM, and ElevenLabs TTS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Live2D Cubism Core — must load before the Live2D avatar mounts. */}
        <script src="/lib/live2dcubismcore.min.js" async />
      </head>
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
