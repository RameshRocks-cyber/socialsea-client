import "./Chat.css";
import ChatMessages from "./ChatMessages";
import { ChatProvider } from "./hooks/useChat";

export default function Chat() {
  return (
    <ChatProvider>
      <ChatMessages />
    </ChatProvider>
  );
}
