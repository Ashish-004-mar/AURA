package com.aura.chat.ui

import android.os.Bundle
import android.widget.EditText
import android.widget.ImageButton
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.aura.chat.R
import com.aura.chat.adapter.ChatAdapter
import com.aura.chat.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val viewModel: ChatViewModel by viewModels()
    private lateinit var chatAdapter: ChatAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        setupRecyclerView()
        setupInput()
        observeViewModel()
    }

    private fun setupRecyclerView() {
        val recyclerView: RecyclerView = findViewById(R.id.recyclerView)
        chatAdapter = ChatAdapter()
        val layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        recyclerView.layoutManager = layoutManager
        recyclerView.adapter = chatAdapter
    }

    private fun setupInput() {
        val etInput: EditText = findViewById(R.id.etMessage)
        val btnSend: ImageButton = findViewById(R.id.btnSend)

        btnSend.setOnClickListener {
            val input = etInput.text.toString()
            if (input.isNotBlank()) {
                viewModel.sendMessage(input)
                etInput.text.clear()
            }
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            viewModel.chatHistory.collect { messages ->
                chatAdapter.submitList(messages) {
                    val recyclerView: RecyclerView = findViewById(R.id.recyclerView)
                    if (messages.isNotEmpty()) {
                        recyclerView.smoothScrollToPosition(messages.size - 1)
                    }
                }
            }
        }
    }
}
