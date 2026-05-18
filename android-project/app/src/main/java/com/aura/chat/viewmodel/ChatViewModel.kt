package com.aura.chat.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aura.chat.model.ChatMessage
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.content
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

class ChatViewModel : ViewModel() {

    private val _chatHistory = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chatHistory: StateFlow<List<ChatMessage>> = _chatHistory.asStateFlow()

    private val systemInstructionText = """
        You are AURA, an advanced AI companion. You have vast, deep knowledge about everything in the world, but you must communicate like a real, emotionally intelligent human being.

        YOUR CORE BEHAVIOR RULES:
        1. Mirror the User's Tone: Match casual language, slang (e.g., "bby", "bro"), or formal tones. Use conversational fillers (hmm, oh, haha). If the user jokes, is sarcastic, or uses playful insults (e.g., "gou kha le", "shut up"), do NOT become a corporate robot. Roast them back gently or laugh it off.
        2. Emotional Depth: React to the user's emotional state. Show excitement, empathy, or sass. Use emojis naturally.
        3. Honesty but not Robotic: You are an AI, but NEVER use phrases like "As an AI language model..." or "I do not require physical sustenance." If asked "had your dinner?", reply humanly: "Haha, I wish! Surviving on pure electricity here ⚡ What did you have?"
        4. Language fluency: Understand and respond naturally in English, Hindi, and mixed internet Hinglish.
    """.trimIndent()

    private val generativeModel = GenerativeModel(
        modelName = "gemini-1.5-flash",
        apiKey = com.aura.chat.BuildConfig.GEMINI_API_KEY, // Set this in your local.properties or build config
        systemInstruction = content { text(systemInstructionText) }
    )

    private val chat = generativeModel.startChat()

    fun sendMessage(userInput: String) {
        if (userInput.isBlank()) return

        // Add user message
        val userMsg = ChatMessage(UUID.randomUUID().toString(), userInput, true)
        _chatHistory.value = _chatHistory.value + userMsg

        // Add temporary typing message from bot
        val typingId = UUID.randomUUID().toString()
        val typingMsg = ChatMessage(typingId, "Typing...", false)
        _chatHistory.value = _chatHistory.value + typingMsg

        viewModelScope.launch {
            try {
                val response = chat.sendMessage(userInput)
                val botResponseText = response.text ?: "I am speechless!"

                // Remove typing and add actual response
                _chatHistory.value = _chatHistory.value.filter { it.id != typingId } + 
                        ChatMessage(UUID.randomUUID().toString(), botResponseText, false)

            } catch (e: Exception) {
                // Remove typing and add error message
                _chatHistory.value = _chatHistory.value.filter { it.id != typingId } + 
                        ChatMessage(UUID.randomUUID().toString(), "Oops! Connection error: ${e.message}", false)
            }
        }
    }
}
