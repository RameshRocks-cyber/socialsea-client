import { ChatProvider } from "../pages/hooks/useChat";

export default function ChatRouteShell({ children }) {
  return <ChatProvider>{children}</ChatProvider>;
}
