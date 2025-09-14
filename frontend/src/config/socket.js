import socket from "socket.io-client";

let socketinstance = null;

const initializeSocket = (projectId) => {
  // Disconnect existing socket if any
  if (socketinstance) {
    socketinstance.disconnect();
  }

  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
  socketinstance = socket(API_BASE_URL, {
    auth: {
      token: localStorage.getItem("token"),
    },
    query: {
      projectId,
    },
  });

  // Store globally for cleanup
  window.socketinstance = socketinstance;
  return socketinstance;
};

const receiveMessage = (eventName, cb) => {
  if (socketinstance) {
    socketinstance.on(eventName, cb);
  }
};
const sendMessage = (eventName, data) => {
  if (socketinstance) {
    socketinstance.emit(eventName, data);
  }
};

export { initializeSocket, receiveMessage, sendMessage };
