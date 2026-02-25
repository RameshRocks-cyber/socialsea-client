import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import "./Chat.css";

const STORE_KEY = "socialsea_chat_messages_v1";

export default function Chat() {
  const [contacts, setContacts] = useState([]);
  const [activeContactId, setActiveContactId] = useState("");
  const [messagesByContact, setMessagesByContact] = useState({});
  const [inputText, setInputText] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");

  const normalizeDisplayName = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "User";
    const local = raw.includes("@") ? raw.split("@")[0] : raw;
    const withoutDigits = local.replace(/\d+$/g, "");
    const cleaned = withoutDigits.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "User";
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  useEffect(() => {
    Promise.allSettled([api.get("/api/feed"), api.get("/api/reels")])
      .then((results) => {
        const feedItems =
          results[0]?.status === "fulfilled" && Array.isArray(results[0].value?.data)
            ? results[0].value.data
            : [];
        const reelItems =
          results[1]?.status === "fulfilled" && Array.isArray(results[1].value?.data)
            ? results[1].value.data
            : [];
        const items = [...feedItems, ...reelItems];
        const me = Number(localStorage.getItem("userId"));
        const dedup = new Map();
        items.forEach((post) => {
          const user = post?.user;
          if (!user) return;
          if (Number(user.id) === me) return;
          if (dedup.has(user.id)) return;
          const rawName = user.name || post.username || user.email || `User ${user.id}`;
          const displayName = normalizeDisplayName(rawName);
          dedup.set(user.id, {
            id: String(user.id),
            name: displayName,
            email: user.email || "",
            avatar: (displayName[0] || "U").toUpperCase()
          });
        });

        const list = Array.from(dedup.values());
        setContacts(list);
        setActiveContactId((prev) => prev || (list[0]?.id || ""));
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load chat contacts");
      });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === "object") setMessagesByContact(data);
    } catch {
      // ignore invalid localStorage
    }
  }, []);

  const persistMessages = (next) => {
    setMessagesByContact(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  };

  const filteredContacts = useMemo(() => {
    if (!query.trim()) return contacts;
    const q = query.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const newChatCandidates = useMemo(() => {
    if (!newChatQuery.trim()) return contacts;
    const q = newChatQuery.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)
    );
  }, [contacts, newChatQuery]);

  const activeContact = contacts.find((c) => c.id === activeContactId) || null;
  const activeMessages = messagesByContact[activeContactId] || [];

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || !activeContactId) return;
    const next = {
      ...messagesByContact,
      [activeContactId]: [
        ...(messagesByContact[activeContactId] || []),
        {
          id: Date.now(),
          mine: true,
          text,
          ts: new Date().toISOString()
        }
      ]
    };
    persistMessages(next);
    setInputText("");
  };

  const startNewChat = (contactId) => {
    setActiveContactId(contactId);
    setNewChatOpen(false);
    setNewChatQuery("");
  };

  return (
    <div className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <h2>Messages</h2>
          <button type="button" className="new-chat-btn" onClick={() => setNewChatOpen(true)}>
            + New Chat
          </button>
        </div>
        <input
          type="text"
          className="chat-search"
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {error && <p className="chat-error">{error}</p>}
        <div className="chat-contact-list">
          {filteredContacts.map((c) => {
            const preview = (messagesByContact[c.id] || []).slice(-1)[0];
            return (
              <button
                key={c.id}
                type="button"
                className={`chat-contact ${activeContactId === c.id ? "active" : ""}`}
                onClick={() => setActiveContactId(c.id)}
              >
                <span className="chat-avatar">{c.avatar}</span>
                <span className="chat-meta">
                  <strong>{c.name}</strong>
                  <small>{preview?.text || "Tap to start chatting"}</small>
                </span>
              </button>
            );
          })}
          {!error && filteredContacts.length === 0 && <p className="chat-empty">No users found</p>}
        </div>

        {newChatOpen && (
          <div className="new-chat-modal-backdrop" onClick={() => setNewChatOpen(false)}>
            <div className="new-chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="new-chat-top">
                <h4>Start New Chat</h4>
                <button type="button" onClick={() => setNewChatOpen(false)}>x</button>
              </div>
              <input
                type="text"
                className="chat-search"
                placeholder="Search people"
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
              />
              <div className="new-chat-list">
                {newChatCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chat-contact"
                    onClick={() => startNewChat(c.id)}
                  >
                    <span className="chat-avatar">{c.avatar}</span>
                    <span className="chat-meta">
                      <strong>{c.name}</strong>
                      <small>Start conversation</small>
                    </span>
                  </button>
                ))}
                {newChatCandidates.length === 0 && <p className="chat-empty">No users found</p>}
              </div>
            </div>
          </div>
        )}
      </aside>

      <section className="chat-main">
        {!activeContact && <p className="chat-placeholder">Select a conversation</p>}

        {activeContact && (
          <>
            <header className="chat-header">
              <span className="chat-avatar">{activeContact.avatar}</span>
              <h3>{activeContact.name}</h3>
            </header>

            <div className="chat-thread">
              {activeMessages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.mine ? "mine" : "their"}`}>
                  {m.text}
                </div>
              ))}
              {activeMessages.length === 0 && (
                <p className="chat-empty-thread">No messages yet. Say hi.</p>
              )}
            </div>

            <div className="chat-input-row">
              <input
                type="text"
                placeholder="Message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <button type="button" onClick={sendMessage}>Send</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
