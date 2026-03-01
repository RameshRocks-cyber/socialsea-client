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
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchUsers, setSearchUsers] = useState([]);
  const [sidebarSearchUsers, setSidebarSearchUsers] = useState([]);

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
    const q = query.trim().toLowerCase();
    const local = !q
      ? contacts
      : contacts.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)
        );

    const merged = new Map();
    [...local, ...sidebarSearchUsers].forEach((c) => {
      if (!c?.id) return;
      if (!merged.has(c.id)) merged.set(c.id, c);
    });
    return Array.from(merged.values());
  }, [contacts, query, sidebarSearchUsers]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setSidebarSearchUsers([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/api/profile/search", { params: { q } });
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        const mapped = data.map((u) => {
          const rawName = u?.name || u?.email || `User ${u?.id ?? ""}`;
          const displayName = normalizeDisplayName(rawName);
          return {
            id: String(u?.id),
            name: displayName,
            email: u?.email || "",
            avatar: (displayName[0] || "U").toUpperCase()
          };
        });
        setSidebarSearchUsers(mapped);
      } catch {
        if (!cancelled) setSidebarSearchUsers([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const q = newChatQuery.trim();

    if (q.length < 1) {
      setSearchUsers([]);
      setSearchingUsers(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingUsers(true);
        const res = await api.get("/api/profile/search", { params: { q } });
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        const mapped = data.map((u) => {
          const rawName = u?.name || u?.email || `User ${u?.id ?? ""}`;
          const displayName = normalizeDisplayName(rawName);
          return {
            id: String(u?.id),
            name: displayName,
            email: u?.email || "",
            avatar: (displayName[0] || "U").toUpperCase()
          };
        });
        setSearchUsers(mapped);
      } catch (err) {
        console.error(err);
        if (!cancelled) setSearchUsers([]);
      } finally {
        if (!cancelled) setSearchingUsers(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newChatQuery]);

  const newChatCandidates = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase();
    const local = !q
      ? contacts
      : contacts.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)
        );

    const merged = new Map();
    [...local, ...searchUsers].forEach((c) => {
      if (!c?.id) return;
      if (!merged.has(c.id)) merged.set(c.id, c);
    });
    return Array.from(merged.values());
  }, [contacts, newChatQuery, searchUsers]);

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

  const startNewChat = (contact) => {
    setContacts((prev) => {
      if (prev.some((x) => x.id === contact.id)) return prev;
      return [contact, ...prev];
    });
    setActiveContactId(contact.id);
    setNewChatOpen(false);
    setNewChatQuery("");
  };

  const openContact = (contact) => {
    setContacts((prev) => {
      if (prev.some((x) => x.id === contact.id)) return prev;
      return [contact, ...prev];
    });
    setActiveContactId(contact.id);
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
                onClick={() => openContact(c)}
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
                {searchingUsers && <p className="chat-empty">Searching users...</p>}
                {newChatCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chat-contact"
                    onClick={() => startNewChat(c)}
                  >
                    <span className="chat-avatar">{c.avatar}</span>
                    <span className="chat-meta">
                      <strong>{c.name}</strong>
                      <small>{c.email || "Start conversation"}</small>
                    </span>
                  </button>
                ))}
                {!searchingUsers && newChatCandidates.length === 0 && (
                  <p className="chat-empty">No users found</p>
                )}
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
