import { ChatProvider } from "../pages/hooks/useChat";
import VideoCall from "../pages/VideoCall";

export default function AuthedRealtimeShell({ children }) {
  return (
    <ChatProvider>
      <VideoCall placement="page" />
      <VideoCall placement="thread" />
      {children}
    </ChatProvider>
  );
}
