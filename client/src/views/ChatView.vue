<template>
  <div class="chat-page-container" :class="{ 'dark-mode': darkMode }">
    <div class="chat-container">
      <div class="chat-header">
        <div class="user-nickname-label">{{ myNickname }}</div>
        <button @click="toggleDarkMode" class="dark-mode-toggle">
          {{ darkMode ? '☀️ Light Mode' : '🌙 Dark Mode' }}
        </button>
      </div>
      <div ref="messagesContainer" class="messages">
        <div v-for="(message, index) in messages" :key="index" class="message" :class="{ 'my-message': message.sender === myNickname }">
          <template v-if="message.type === 'chat'">
            <span v-if="message.sender !== myNickname" class="message-sender">{{ message.sender }}:</span> {{ message.text }}
          </template>
          <template v-else-if="message.type === 'image'">
            <span v-if="message.sender !== myNickname" class="message-sender">{{ message.sender }}:</span>
            <img :src="message.data" alt="Attached Image" class="chat-image" />
          </template>
          <template v-else-if="message.type === 'file'">
            <span v-if="message.sender !== myNickname" class="message-sender">{{ message.sender }}:</span>
            <a :href="message.data" :download="message.fileName" class="chat-file-link">
              <span class="file-icon">📄</span> {{ message.fileName }} ({{ (message.fileSize / 1024).toFixed(2) }} KB)
            </a>
          </template>
        </div>
      </div>
      <div class="input-area">
        <input v-model="newMessage" @keyup.enter="sendMessage" placeholder="메시지를 입력하세요..." />
        <div class="emoji-picker">
          <button @click="toggleEmojiPicker" class="emoji-button">😊</button>
          <div v-if="showEmojiPicker" class="emoji-list">
            <div class="emoji-grid">
              <span v-for="emoji in paginatedEmojis" :key="emoji" @click="addEmoji(emoji)">{{ emoji }}</span>
            </div>
            <div class="emoji-pagination">
              <button @click="prevEmojiPage" :disabled="emojiPage === 0"><</button>
              <span>{{ emojiPage + 1 }} / {{ totalEmojiPages }}</span>
              <button @click="nextEmojiPage" :disabled="emojiPage === totalEmojiPages - 1">></button>
            </div>
          </div>
        </div>
        <input type="file" accept="image/*" @change="handleImageUpload" ref="imageInput" style="display: none;" />
        <button @click="imageInput?.click()" class="attach-button">이미지</button>
        <input type="file" @change="handleFileUpload" ref="fileInput" style="display: none;" />
        <button @click="fileInput?.click()" class="attach-button">파일</button>
        <button @click="sendMessage">전송</button>
      </div>
    </div>
    <div class="user-list-container">
      <h3>접속자 ({{ users.length }})</h3>
      <ul>
        <li v-for="user in users" :key="user">{{ user }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';

let ws: WebSocket | null = null;

interface ChatMessage {
  sender: string;
  text?: string;
  type: 'chat' | 'image' | 'file';
  data?: string;
  fileName?: string;
  fileSize?: number;
}

const messages = ref<ChatMessage[]>([]);
const newMessage = ref<string>('');
const messagesContainer = ref<HTMLElement | null>(null);
const myNickname = ref<string>('Guest');
const users = ref<string[]>([]);
const showEmojiPicker = ref<boolean>(false);
const emojis = [
  '😊', '😂', '👍', '❤️', '🎉', '🤔', '👏', '🔥', '💯', '👍',
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '☺️', '😊',
  '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
  '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
  '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
  '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠',
  '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
  '😓', '🤗', '🤫', '🤥', '😶', '😐', '😑', '😬',
  '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤',
  '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻',
  '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻',
  '😼', '😽', '🙀', '😿', '😾'
];
const emojisPerPage = 12;
const emojiPage = ref(0);

const paginatedEmojis = computed(() => {
  const start = emojiPage.value * emojisPerPage;
  const end = start + emojisPerPage;
  return emojis.slice(start, end);
});

const totalEmojiPages = computed(() => Math.ceil(emojis.length / emojisPerPage));

const prevEmojiPage = () => {
  if (emojiPage.value > 0) {
    emojiPage.value--;
  }
};

const nextEmojiPage = () => {
  if (emojiPage.value < totalEmojiPages.value - 1) {
    emojiPage.value++;
  }
};
const imageInput = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const historyOffset = ref(0);
const historyLimit = 50;
const hasMoreHistory = ref(true);

const darkMode = ref<boolean>(localStorage.getItem('darkMode') === 'true');

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const requestHistory = () => {
  if (ws && ws.readyState === WebSocket.OPEN && hasMoreHistory.value) {
    ws.send(JSON.stringify({ type: 'requestHistory', offset: historyOffset.value, limit: historyLimit }));
  }
};

const handleScroll = () => {
  if (messagesContainer.value && messagesContainer.value.scrollTop === 0 && hasMoreHistory.value) {
    requestHistory();
  }
};

const toggleDarkMode = () => {
  darkMode.value = !darkMode.value;
  localStorage.setItem('darkMode', String(darkMode.value));
};

onMounted(() => {
  const isSecure = window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss' : 'ws';
  const hostname = window.location.hostname;
  const port = isSecure ? 443 : 8000;
  const wsUrl = `${protocol}://${hostname}:${port}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    requestHistory();
  };

  if (messagesContainer.value) {
    messagesContainer.value.addEventListener('scroll', handleScroll);
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'nickname') {
        myNickname.value = data.nickname;
      } else if (data.type === 'chat') {
        messages.value.push({ sender: data.sender, type: 'chat', text: data.text });
      } else if (data.type === 'image') {
        messages.value.push({ sender: data.sender, type: 'image', data: data.data });
      } else if (data.type === 'file') {
        messages.value.push({ sender: data.sender, type: 'file', data: data.data, fileName: data.fileName, fileSize: data.fileSize });
      } else if (data.type === 'userList') {
        users.value = data.users;
      } else if (data.type === 'history') {
        const oldScrollHeight = messagesContainer.value?.scrollHeight || 0;
        messages.value = [...data.messages, ...messages.value];
        historyOffset.value += data.messages.length;
        hasMoreHistory.value = data.hasMore;
        nextTick(() => {
          if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight - oldScrollHeight;
          }
        });
      }
    } catch (e) {
      messages.value.push({ sender: 'Unknown', type: 'chat', text: event.data });
    }
  };

  ws.onclose = () => {
    messages.value.push({ sender: 'System', type: 'chat', text: '서버와의 연결이 끊어졌습니다.' });
  };

  ws.onerror = (error) => {
    messages.value.push({ sender: 'System', type: 'chat', text: 'WebSocket 오류가 발생했습니다.' });
  };
});

onUnmounted(() => {
  if (ws) {
    ws.close();
  }
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener('scroll', handleScroll);
  }
});

watch(messages, () => {
  nextTick(() => {
    scrollToBottom();
  });
}, { deep: true });

const sendMessage = () => {
  if (newMessage.value.trim() !== '' && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'chat', text: newMessage.value }));
    newMessage.value = '';
  }
  showEmojiPicker.value = false;
};

const toggleEmojiPicker = () => {
  showEmojiPicker.value = !showEmojiPicker.value;
};

const addEmoji = (emoji: string) => {
  newMessage.value += emoji;
};

const handleImageUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file && ws && ws.readyState === WebSocket.OPEN) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        ws.send(JSON.stringify({ type: 'image', data: e.target.result }));
      }
    };
    reader.readAsDataURL(file);
  }
};

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file && ws && ws.readyState === WebSocket.OPEN) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        ws.send(JSON.stringify({ type: 'file', data: e.target.result, fileName: file.name, fileSize: file.size }));
      }
    };
    reader.readAsDataURL(file);
  }
};
</script>


<style scoped src="./Chat.css"></style>
