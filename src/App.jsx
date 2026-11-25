import { useEffect, useRef, useState } from "react";

const API = "http://localhost:8000";

export default function App() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState("Assistant");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const patchLast = (fn) =>
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: question },
      { role: "assistant", text: "" },
    ]);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question,
          subject: subject.trim() || "Assistant",
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        patchLast((m) => ({ ...m, text: m.text + chunk }));
      }
    } catch (err) {
      patchLast((m) => ({
        ...m,
        error: true,
        text: `Couldn't reach the server. Check that FastAPI and Ollama are running. (${err.message})`,
      }));
    } finally {
      setBusy(false);
    }
  }

  async function clearChat() {
    setMessages([]);
    try {
      await fetch(`${API}/chat/${sessionId}`, { method: "DELETE" });
    } catch {
      /* history is in memory only, safe to ignore */
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="subject">
          <label htmlFor="subject">Teacher of</label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Physics"
          />
        </div>
        <button className="ghost" onClick={clearChat} disabled={!messages.length}>
          New chat
        </button>
      </header>

      <main className="thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty">
            <h1>Ask your {subject.trim() || "Assistant"} teacher anything.</h1>
            <p>Answers stay short, around 50 words. Change the subject above at any time.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? " error" : ""}`}>
            <div className="bubble">
              {m.text || <span className="typing"><i /><i /><i /></span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your question"
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </footer>
    </div>
  );
}
