const callButton = document.getElementById('callButton');
        const callStatus = document.getElementById('callStatus');
        const callTimer = document.getElementById('callTimer');
        const statusText = document.getElementById('statusText');
        const avatar = document.getElementById('avatar');
        const conversationArea = document.getElementById('conversationArea');
        const waveContainer = document.getElementById('waveContainer');
        const startMessageTextarea = document.getElementById('startMessage');
        const rolePromptTextarea = document.getElementById('rolePrompt');
        const trainBtn = document.getElementById('trainBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        let ws = null;
        let isCallActive = false;
        let callStartTime = null;
        let callInterval = null;
        let recognition = null;
        let isListening = false;
        let isProcessing = false;
        let audioPlayer = new Audio();
        let startMessageSent = false;  // FIX: Track if start message already sent
        
        function getWebSocketUrl() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${window.location.host}/ws/call/`;
        }
        
        function playAudio(base64Audio) {
            if (!base64Audio) return;
            try {
                const audioBlob = base64ToBlob(base64Audio, 'audio/mpeg');
                const audioUrl = URL.createObjectURL(audioBlob);
                audioPlayer.src = audioUrl;
                audioPlayer.play();
                audioPlayer.onplay = () => {
                    avatar.classList.add('speaking');
                    statusText.innerHTML = '<i class="fas fa-volume-up"></i> <strong>بوٹ بول رہی ہے...</strong>';
                    
                };
                audioPlayer.onended = () => {
                    avatar.classList.remove('speaking');
                    URL.revokeObjectURL(audioUrl);
                    if (isCallActive && !isProcessing) {
                        statusText.innerHTML = '<i class="fas fa-microphone-alt"></i> <strong>سن رہی ہوں...</strong>';
                        startListening();
                    }
                };
            } catch(e) { console.error('Audio play error:', e); }
        }
        
        function base64ToBlob(base64, mimeType) {
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.lang = 'ur-PK';
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onstart = () => {
                isListening = true;
                avatar.classList.add('listening');
                waveContainer.style.display = 'flex';
                statusText.innerHTML = '<i class="fas fa-microphone-alt"></i> <strong>سن رہی ہوں... بولیں</strong>';
            };
            recognition.onend = () => {
                isListening = false;
                if (isCallActive && !isProcessing) {
                    setTimeout(() => { 
                        if (isCallActive && !isProcessing && recognition) {
                            try { recognition.start(); } catch(e) {}
                        }
                    }, 200);
                } else if (!isCallActive) {
                    waveContainer.style.display = 'none';
                    avatar.classList.remove('listening');
                }
            };
            recognition.onresult = (event) => {
                if (!isCallActive || isProcessing) return;
                let final = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) final += event.results[i][0].transcript;
                }
                if (final.trim()) processUserSpeech(final);
            };
        }
        
        function startListening() {
            if (recognition && isCallActive && !isListening && !isProcessing) {
                try { recognition.start(); } catch(e) {}
            }
        }
        
        function addMessage(text, sender) {
            const div = document.createElement('div');
            div.className = `message ${sender}`;
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            div.innerHTML = `<div class="message-text">${text}</div><span class="message-time">${time}</span>`;
            conversationArea.appendChild(div);
            div.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        
        function showTyping() {
            const typing = document.createElement('div');
            typing.className = 'typing-indicator';
            typing.id = 'typingIndicator';
            typing.innerHTML = '<span></span><span></span><span></span>';
            conversationArea.appendChild(typing);
            typing.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        
        function hideTyping() { const t = document.getElementById('typingIndicator'); if (t) t.remove(); }
        
        function processUserSpeech(text) {
            if (!text.trim() || !isCallActive || isProcessing) return;
            if (isListening) recognition?.stop();
            addMessage(text, 'user');
            sendToBot(text);
        }
        
        function sendToBot(text) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                showTyping();
                isProcessing = true;
                statusText.innerHTML = '<i class="fas fa-brain"></i> <strong>سوچ رہی ہوں...</strong>';
                ws.send(JSON.stringify({ type: "user_text", data: text }));
            }
        }
        
        /////////////////////// =======> 👇 یہ اوپر variables کے بعد add کریں
async function setupMic() {
    try {
        await navigator.mediaDevices.getUserMedia({
            audio: {
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true
            }
        });
        console.log("🎤 Mic optimized");
    } catch (e) {
        console.error("Mic error:", e);
    }
}
        // FIXED: Start call without auto-triggering
        function startCall() {

         setupMic(); // For INput Noise Reduction

             // ✅ CLEAR OLD CHAT
            conversationArea.innerHTML = `
                <div class="message bot">
                    <div class="message-text">🌟 اردو آواز اسسٹنٹ تیار ہے!</div>
                    <span class="message-time">ابھی</span>
                </div>
            `;
            const wsUrl = getWebSocketUrl();
            ws = new WebSocket(`${wsUrl}call_${Date.now()}`);
            startMessageSent = false;
            
            ws.onopen = () => {


                const currentStartMessage = startMessageTextarea.value || "السلام علیکم! میں آپ کی مدد کر سکتی ہوں۔";
                const currentRolePrompt = rolePromptTextarea.value;

                ws.send(JSON.stringify({ type: "update_role", data: rolePromptTextarea.value }));
                ws.send(JSON.stringify({ type: "update_start_message", data: currentStartMessage }));
                
                isCallActive = true;

                // ✅ ADD THIS BLOCK
                setTimeout(() => {
                    if (!startMessageSent) {
                        startMessageSent = true;

                        // Send to backend to generate TTS
                        ws.send(JSON.stringify({
                            type: "start_message_trigger",
                            data: currentStartMessage
                        }));
                    }
                }, 500);

                callStartTime = Date.now();
                callButton.classList.add('active');
                callButton.innerHTML = '<i class="fas fa-phone-slash"></i>';
                callStatus.innerHTML = '<i class="fas fa-phone-alt"></i> <span>منسلک</span>';
                callInterval = setInterval(() => {
                    if (callStartTime) {
                        const e = Math.floor((Date.now() - callStartTime) / 1000);
                        callTimer.innerText = `${Math.floor(e/60).toString().padStart(2,'0')}:${(e%60).toString().padStart(2,'0')}`;
                    }
                }, 1000);
                
                // FIX: Don't auto-send start message, just wait for user
                statusText.innerHTML = '<i class="fas fa-microphone-alt"></i> <strong>سن رہی ہوں... بولیں</strong>';
                setTimeout(() => startListening(), 500);
            };
            
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.type === "bot_text") {
                    hideTyping();
                    addMessage(data.data, 'bot');
                    if (data.audio) playAudio(data.audio);
                    isProcessing = false;
                } else if (data.type === "role_updated") {
                    statusText.innerHTML = '<i class="fas fa-check-circle"></i> بوٹ ٹرین ہو گیا!';
                    setTimeout(() => {
                        if (isCallActive) statusText.innerHTML = '<i class="fas fa-microphone-alt"></i> <strong>سن رہی ہوں...</strong>';
                    }, 2000);
                }
            };
            
            ws.onerror = () => { endCall(); };
            ws.onclose = () => { if (isCallActive) endCall(); };
        }
        
        function trainBot() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "update_role", data: rolePromptTextarea.value }));
                ws.send(JSON.stringify({ type: "update_start_message", data: startMessageTextarea.value }));
                statusText.innerHTML = '<i class="fas fa-check-circle"></i> ✅ بوٹ ٹرین ہو گیا!';
            } else {
                statusText.innerHTML = '<i class="fas fa-check-circle"></i> ✅ سیٹنگیں محفوظ! کال شروع کریں۔';
            }
        }
        
        function endCall() {
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "disconnect" }));
            isCallActive = false;
            isProcessing = false;
            if (ws) ws.close();
            ws = null;
            if (callInterval) clearInterval(callInterval);
            if (isListening) recognition?.stop();
            audioPlayer.pause();
            callButton.classList.remove('active');
            callButton.innerHTML = '<i class="fas fa-phone-alt"></i>';
            callStatus.innerHTML = '<i class="fas fa-phone-slash"></i> <span>کال ختم</span>';
            callTimer.innerText = '00:00';
            statusText.innerHTML = '<i class="fas fa-info-circle"></i> <span>کال شروع کرنے کے لیے سبز بٹن دبائیں</span>';
            avatar.classList.remove('speaking', 'listening');
            waveContainer.style.display = 'none';
            startMessageSent = false;
        }
        
        function resetToDefault() {
            rolePromptTextarea.value = "";
            startMessageTextarea.value = "";
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> ✅ ڈیفالٹ پر ری سیٹ!';
        }
        
        callButton.addEventListener('click', () => isCallActive ? endCall() : startCall());
        trainBtn.addEventListener('click', trainBot);
        resetBtn.addEventListener('click', resetToDefault);
        
        console.log('✅ Urdu Voice Agent Ready! Bot will understand complete sentences and give short but complete answers');
    