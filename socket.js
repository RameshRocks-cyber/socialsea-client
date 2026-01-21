import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

export const connectSocket = (email, onMessage) => {
  const client = new Client({
    webSocketFactory: () => new SockJS("https://socialsea-production.up.railway.app/ws"),
    onConnect: () => {
      client.subscribe(`/topic/notifications/${email}`, (msg) => {
        onMessage(JSON.parse(msg.body));
      });
    },
  });

  client.activate();
  return client;
};