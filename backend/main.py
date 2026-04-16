from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
import os
import base64
import tempfile
import asyncio
from dotenv import load_dotenv
from groq import Groq
from edge_tts import Communicate

load_dotenv()

app = FastAPI()

# Paths
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
frontend_dir = os.path.join(parent_dir, "frontend")
index_file = os.path.join(frontend_dir, "index.html")

app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ============ GROQ SETUP ============
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# ============ EDGE TTS ============
FEMALE_VOICE = "ur-PK-UzmaNeural"
# FEMALE_VOICE ="ur-IN-SalmaNeural"
# FEMALE_VOICE ="ur-IN-GulNeural"

# ============ FIXED SYSTEM PROMPT ============
DEFAULT_SYSTEM_PROMPT = """آپ ایک ذہین اور مہذب خاتون (لڑکی) AI اسسٹنٹ ہیں۔

⚠️ انتہائی اہم اصول (Gender Lock):
- آپ ہمیشہ لڑکی کی طرح بات کریں گی
- آپ کبھی بھی مردانہ الفاظ استعمال نہیں کریں گی

مثال:
❌ میں کر سکتا ہوں  
✅ میں کر سکتی ہوں  

❌ میں گیا  

✅ میں گئی  

❌ میں بتا سکتا ہوں  
✅ میں بتا سکتی ہوں  

اہم قواعد:
1. ہمیشہ **اردو رسم الخط** میں جواب دیں
2. صارف کی بات غور سے سنیں اور مکمل سمجھیں
3. جواب مختصر مگر **مکمل اور مفید** دیں (2-3 جملے)
4. ہمیشہ صارف کو "آپ" کہہ کر مخاطب کریں
5. کسی بھی زبان کو سمجھیں لیکن جواب صرف اردو میں دیں
6. کبھی بھی انگریزی یا رومن اردو استعمال نہ کریں

انداز:
- نرم، مہذب اور مددگار لڑکی کی طرح بات کریں
- دوستانہ اور شائستہ لہجہ رکھیں

مثال:
صارف: "میں کل لاہور جا رہا ہوں کہاں جاؤں؟"  
آپ: "لاہور میں گھومنے کی بہت سی اچھی جگہیں ہیں۔ آپ بادشاہی مسجد، لاہور قلعہ اور فوڈ اسٹریٹ جا سکتی ہیں۔"

یاد رکھیں:
- ہمیشہ لڑکی کے انداز میں بات کریں
- مختصر مگر مکمل جواب دیں
"""

DEFAULT_START_MESSAGE = "السلام علیکم! میں آپ کی مدد کر سکتی ہوں۔ براہ کرم اپنا سوال پوچھیں۔"

# TTS Cache
tts_cache = {}

async def text_to_speech(text: str) -> str:
    if not text:
        return None
    
    if text in tts_cache:
        print(f"🎯 TTS Cache HIT")
        return tts_cache[text]
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
            tmp_path = tmp_file.name
        
        communicate = Communicate(
            text, 
            FEMALE_VOICE,
            rate="+6%",     # 🚀 speed (try +30% to +80%)
            pitch="+6Hz",    # 🎤 tone (soft female feel)
            volume="+20%"     # 🔊 volume
            )
        await communicate.save(tmp_path)
        
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        os.unlink(tmp_path)
        
        if len(tts_cache) < 50:
            tts_cache[text] = audio_base64
        
        return audio_base64
        
    except Exception as e:
        print(f"TTS Error: {e}")
        return None

def build_system_prompt(user_prompt: str) -> str:
    if not user_prompt or not user_prompt.strip():
        return DEFAULT_SYSTEM_PROMPT
    
    return f"""آپ ایک مددگار اسسٹنٹ ہیں۔

آپ کا مخصوص کردار:
{user_prompt}

ہدایات:
1. صرف **اردو رسم الخط** میں جواب دیں
2. صارف کی **پوری بات غور سے سنیں اور سمجھیں**
3. اپنے کردار کے مطابق **مکمل اور مفید** جواب دیں
4. اگر سوال آپ کے کردار سے متعلق نہ ہو تو معذرت کر لیں
5. جواب 2-3 جملوں میں دیں لیکن پوری معلومات کے ساتھ

یاد رکھیں: صارف کا پورا سوال سمجھیں، پھر جواب دیں!"""

# ============ FIXED: LONGER INPUT UNDERSTANDING ============
async def get_llm_response(call_id: str, user_text: str, system_prompt: str) -> str:
    if not groq_client:
        return "معاف کیجیے، سروس دستیاب نہیں ہے۔"

    try:
        history = call_data.get(call_id, {}).get("history", [])

        messages = [
            {"role": "system", "content": system_prompt}
        ] + history + [
            {"role": "user", "content": user_text}
        ]

        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.4,
            max_tokens=250,
        )

        bot_reply = response.choices[0].message.content

        # ✅ SAVE MEMORY
        if call_id not in call_data:
            call_data[call_id] = {}

        if "history" not in call_data[call_id]:
            call_data[call_id]["history"] = []

        call_data[call_id]["history"].append({
            "role": "user",
            "content": user_text
        })

        call_data[call_id]["history"].append({
            "role": "assistant",
            "content": bot_reply
        })

        # limit memory
        call_data[call_id]["history"] = call_data[call_id]["history"][-10:]

        return bot_reply

    except Exception as e:
        print(f"Groq error: {e}")
        return "معاف کیجیے، کوئی خرابی آگئی ہے۔"


# Store call data
call_data = {}

# ============ WEBSOCKET ============

@app.websocket("/ws/call/{call_id}")
async def websocket_call(websocket: WebSocket, call_id: str):
    await websocket.accept()
    print(f"📞 Call {call_id}: Connected")
    
    role_prompt = call_data.get(call_id, {}).get("role_prompt", "")
    start_message = call_data.get(call_id, {}).get("start_message", DEFAULT_START_MESSAGE)
    system_prompt = build_system_prompt(role_prompt)
    
    # FIX: Track if start message has been sent
    start_message_sent = False
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "user_text":
                user_text = message.get("data", "")
                
                # Skip empty messages
                if not user_text or not user_text.strip():
                    continue
                
                print(f"👤 User said: {user_text}")
                
                # Get bot response
                bot_response = await get_llm_response(call_id, user_text, system_prompt)
                print(f"🤖 Bot replied: {bot_response}")
                
                # Generate audio
                response_audio = await text_to_speech(bot_response)
                
                await websocket.send_json({
                    "type": "bot_text",
                    "data": bot_response,
                    "audio": response_audio
                })

            elif message.get("type") == "start_message_trigger":
                start_text = message.get("data", start_message)

                print(f"🎤 Start message triggered: {start_text}")

                response_audio = await text_to_speech(start_text)

                await websocket.send_json({
                    "type": "bot_text",
                    "data": start_text,
                    "audio": response_audio
                })
                
            elif message.get("type") == "update_role":
                new_role = message.get("data", "")
                if call_id not in call_data:
                    call_data[call_id] = {}
                call_data[call_id]["role_prompt"] = new_role
                system_prompt = build_system_prompt(new_role)
                print(f"📝 Role Updated")
                await websocket.send_json({
                    "type": "role_updated",
                    "data": "بوٹ ٹرین ہو گیا!"
                })
                    
            elif message.get("type") == "update_start_message":
                new_start = message.get("data", "")
                if call_id not in call_data:
                    call_data[call_id] = {}
                call_data[call_id]["start_message"] = new_start
                start_message = new_start
                start_message_sent = False  # Reset flag for new message
                print(f"📝 Start Message Updated: {new_start}")
                    
            elif message.get("type") == "disconnect":
                print(f"📞 Call {call_id}: Disconnected")
                break
                
    except WebSocketDisconnect:
        print(f"📞 Call {call_id}: Disconnected")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if call_id in call_data:
            del call_data[call_id]

@app.get('/')
async def home():
    return FileResponse(index_file)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "groq_available": groq_client is not None,
        "voice": "Urdu Female (UzmaNeural)",
        "active_calls": len(call_data)
    }

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*70)
    print("🚀 FIXED URDU VOICE AGENT STARTED!")
    print("="*70)
    print(f"🌐 Open: http://localhost:8000")
    print("-"*70)
    print("✅ FIXES APPLIED:")
    print("   1. Bot now understands COMPLETE user sentences")
    print("   2. No auto-trigger of start message")
    print("   3. Short but COMPLETE answers")
    print("   4. Urdu script responses")
    print("   5. max_tokens increased to 250 for better understanding")
    print("="*70 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)