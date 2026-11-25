from typing import Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_ollama import ChatOllama
from pydantic import BaseModel

app = FastAPI(title="Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_template = ChatPromptTemplate.from_messages([
    ("system", "You are a {subject}, answer in 50 words"),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{question}"),
])

llm = ChatOllama(model="llama3.2:latest")
chain = chat_template | llm | StrOutputParser()

# In-memory history, one list per session id (lost on server restart)
sessions: Dict[str, List[BaseMessage]] = {}


class ChatRequest(BaseModel):
    session_id: str
    question: str
    subject: str = "Assistant"


@app.post("/chat")
async def chat(req: ChatRequest):
    history = sessions.setdefault(req.session_id, [])

    async def token_stream():
        reply = ""
        async for chunk in chain.astream({
            "subject": req.subject,
            "question": req.question,
            "chat_history": history,
        }):
            reply += chunk
            yield chunk
        # Save the turn only after the full reply has streamed
        history.append(HumanMessage(content=req.question))
        history.append(AIMessage(content=reply))

    return StreamingResponse(token_stream(), media_type="text/plain")


@app.delete("/chat/{session_id}")
async def clear_chat(session_id: str):
    sessions.pop(session_id, None)
    return {"cleared": True}
