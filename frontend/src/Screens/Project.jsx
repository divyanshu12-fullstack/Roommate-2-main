import axios from "axios";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import collabIcon from "../assets/people.png";
import sendIcon from "../assets/send.svg";
import profIcon from "../assets/prof.svg";
import Editor from "@monaco-editor/react";

import { initializeSocket, sendMessage } from "../config/socket";
import { useUser } from "../context/userContext";
import Markdown from "markdown-to-jsx";
import { getWebContainer } from "../config/webContainer";

const Project = () => {
  const location = useLocation();
  const { projectId, userIds = [] } = location.state || {};
  const [users, setUsers] = useState([]);
  const [sidepnl, showsidepnl] = useState(false);
  const [message, setMessage] = useState("");
  const { user } = useUser();
  const messageBox = React.createRef();
  const [messages, setMessages] = useState([]);
  const [openFiles, setOpenFiles] = useState([]);
  const [fileTree, setFileTree] = useState({});
  const [currentFile, setCurrentFile] = useState(null);
  const [webContainer, setWebContainer] = useState(null);
  const [iframeURL, setIframeURL] = useState(null);
  const [runProcess, setRunProcess] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [iframeExpanded, setIframeExpanded] = useState(false);
  const [userCursors, setUserCursors] = useState({});
  const [isReceivingChange, setIsReceivingChange] = useState(false);
  const [lastChangeTime, setLastChangeTime] = useState(0);
  const debounceTimersRef = useRef({});
  const messageIdsRef = useRef(new Set());
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const aiTimeoutRef = useRef(null);

  const send = () => {
    if (!user || !user._id) {
      toast.error("User not loaded yet. Please wait...");
      return;
    }

    const msg = {
      message,
      sender: user._id,
    };

    // Check if this is an AI prompt
    const isAIPrompt = message.includes("@ai");

    if (isAIPrompt) {
      setIsAIGenerating(true);

      // Set a timeout to stop loading after 30 seconds
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
      aiTimeoutRef.current = setTimeout(() => {
        setIsAIGenerating(false);
        toast.error("AI response timed out. Please try again.");
      }, 30000); // 30 seconds timeout
    }

    sendMessage("project-message", msg);
    setMessages((prev) => [...prev, msg]);
    setMessage("");
    scrollToBottom();
  };

  const scrollToBottom = useCallback(() => {
    if (messageBox.current) {
      // Add a small delay to ensure content is rendered
      setTimeout(() => {
        messageBox.current.scrollTop = messageBox.current.scrollHeight;
      }, 100);
    }
  }, [messageBox]);

  // Initialize WebContainer
  useEffect(() => {
    if (!webContainer) {
      getWebContainer().then((container) => {
        setWebContainer(container);
        console.log("✅ WebContainer started");
      });
    }
  }, [webContainer]);

  // Initialize Socket and fetch users (only once)
  useEffect(() => {
    if (!projectId) return;

    initializeSocket(projectId);

    const fetchUsers = async () => {
      try {
        const responses = await Promise.all(
          userIds.map((id) =>
            axios.post(`http://localhost:8080/user/profile`, { id })
          )
        );
        setUsers(responses.map((res) => res.data.data));
      } catch {
        toast.error("Failed to fetch user details");
      }
    };

    if (userIds.length > 0) {
      fetchUsers();
    }

    // Cleanup function to disconnect socket
    return () => {
      if (window.socketinstance) {
        window.socketinstance.disconnect();
      }
    };
  }, [projectId, userIds]);

  // Set up message listeners (only once)
  useEffect(() => {
    if (!projectId || !window.socketinstance) return;

    const socket = window.socketinstance;

    const handleProjectMessage = async (data) => {
      // Create a unique message ID for deduplication
      const messageId = `${data.sender}_${data.message}_${Date.now()}`;

      // Check if we've already processed this message
      if (messageIdsRef.current.has(messageId)) {
        console.log("Duplicate message ignored:", data.message);
        return;
      }

      // Add to processed messages
      messageIdsRef.current.add(messageId);

      // Clean up old message IDs (keep only last 100)
      if (messageIdsRef.current.size > 100) {
        const idsArray = Array.from(messageIdsRef.current);
        messageIdsRef.current.clear();
        idsArray.slice(-50).forEach((id) => messageIdsRef.current.add(id));
      }

      let parsedMsg;
      try {
        parsedMsg =
          typeof data.message === "string"
            ? JSON.parse(data.message)
            : data.message;
      } catch {
        parsedMsg = data.message;
      }

      if (typeof parsedMsg === "object" && parsedMsg.fileTree) {
        try {
          await webContainer?.mount(parsedMsg.fileTree);
          console.log("✅ Mounted fileTree:", Object.keys(parsedMsg.fileTree));
          setFileTree(parsedMsg.fileTree);
        } catch (err) {
          console.error("❌ Failed to mount fileTree:", err);
          toast.error("Failed to load files into WebContainer.");
        }
      }

      // Check if this is an AI response and stop loading
      if (data.sender === "ai" || data.sender?._id === "ai") {
        setIsAIGenerating(false);
        if (aiTimeoutRef.current) {
          clearTimeout(aiTimeoutRef.current);
          aiTimeoutRef.current = null;
        }
      }

      setMessages((prev) => [...prev, data]);
      scrollToBottom();
    };

    const handleCodeChange = (data) => {
      const { fileName, content, userId, userName, timestamp } = data;

      // Prevent infinite loops by checking if this change is from current user
      if (userId === user._id) return;

      // Prevent rapid updates by checking timestamp
      if (timestamp <= lastChangeTime) return;

      console.log(`📝 Code change from ${userName} in file ${fileName}`);

      // Clear existing debounce timer for this file
      if (debounceTimersRef.current[fileName]) {
        clearTimeout(debounceTimersRef.current[fileName]);
      }

      // Set a new debounce timer
      const timer = setTimeout(() => {
        setIsReceivingChange(true);
        setLastChangeTime(timestamp);

        setFileTree((prev) => ({
          ...prev,
          [fileName]: {
            ...prev[fileName],
            file: {
              ...prev[fileName]?.file,
              contents: content,
            },
          },
        }));

        // Reset the flag after a short delay
        setTimeout(() => setIsReceivingChange(false), 100);

        // Clean up the timer
        delete debounceTimersRef.current[fileName];
      }, 300); // 300ms debounce

      debounceTimersRef.current[fileName] = timer;
    };

    const handleCursorChange = (data) => {
      const { fileName, position, userId, userName } = data;

      if (userId === user._id) return;

      setUserCursors((prev) => ({
        ...prev,
        [userId]: {
          fileName,
          position,
          userName,
          timestamp: Date.now(),
        },
      }));
    };

    const handleFileSelect = (data) => {
      const { fileName, userId, userName } = data;

      if (userId === user._id) return;

      console.log(`📁 ${userName} selected file: ${fileName}`);

      // Update the current file if it's different
      if (fileName !== currentFile) {
        setCurrentFile(fileName);
        setOpenFiles((prev) =>
          prev.includes(fileName) ? prev : [...prev, fileName]
        );
      }
    };

    // Add event listeners
    socket.on("project-message", handleProjectMessage);
    socket.on("code-change", handleCodeChange);
    socket.on("cursor-change", handleCursorChange);
    socket.on("file-select", handleFileSelect);

    // Cleanup function to remove listeners
    return () => {
      socket.off("project-message", handleProjectMessage);
      socket.off("code-change", handleCodeChange);
      socket.off("cursor-change", handleCursorChange);
      socket.off("file-select", handleFileSelect);
    };
  }, [
    projectId,
    user._id,
    currentFile,
    lastChangeTime,
    webContainer,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!webContainer) return;

    const handler = (port, url) => {
      console.log("🚀 Server Ready at:", url);
      setIframeURL(url);
    };

    webContainer.on("server-ready", handler);
    return () => webContainer.off("server-ready", handler);
  }, [webContainer]);

  // Clean up old cursor data and debounce timers
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setUserCursors((prev) => {
        const cleaned = {};
        Object.entries(prev).forEach(([userId, cursorData]) => {
          if (now - cursorData.timestamp < 10000) {
            // Keep cursors for 10 seconds
            cleaned[userId] = cursorData;
          }
        });
        return cleaned;
      });
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Clean up debounce timers and AI timeout on unmount
  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, []);

  const writeAImessage = (message) => {
    const messageObject = JSON.parse(message);
    return (
      <div>
        <Markdown>{messageObject.text}</Markdown>
      </div>
    );
  };

  // Component to display user cursors
  const UserCursorIndicator = ({ userName, fileName, position }) => {
    if (fileName !== currentFile) return null;

    return (
      <div
        className="absolute pointer-events-none z-10"
        style={{
          left: `${position.column * 8}px`, // Approximate character width
          top: `${(position.lineNumber - 1) * 20}px`, // Approximate line height
        }}
      >
        <div className="flex items-center">
          <div className="w-0.5 h-5 bg-blue-500"></div>
          <div className="ml-1 px-2 py-1 bg-blue-500 text-white text-xs rounded shadow-lg">
            {userName}
          </div>
        </div>
      </div>
    );
  };

  // AI Loading Indicator Component
  const AILoadingIndicator = () => (
    <div className="w-fit max-w-[90vw] md:max-w-[80%] px-2 py-2 rounded-md m-2 ml-auto flex flex-col bg-[#282828] text-white text-xs sm:text-sm md:text-base">
      <div className="sender text-xs md:text-sm">
        <p className="text-gray-600 text-[10px] md:text-[12px]">AI</p>
      </div>
      <div className="message flex items-center gap-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
          <div
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: "0.1s" }}
          ></div>
          <div
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: "0.2s" }}
          ></div>
        </div>
        <span className="text-gray-300">Generating response...</span>
      </div>
    </div>
  );

  const saveFileTree = async (ft = fileTree) => {
    if (!projectId) {
      toast.error("❌ Project ID is missing.");
      return;
    }

    if (!ft || Object.keys(ft).length === 0) {
      toast.error("⚠️ No file tree to save.");
      return;
    }

    try {
      const res = await axios.post(
        `http://localhost:8080/project/addFiletree`,
        {
          proj_id: projectId,
          filetree: ft,
        }
      );

      if (res.data.success) {
        toast.success("✅ File tree saved successfully!");
      } else {
        toast.error(res.data.message || "Failed to save file tree");
      }
    } catch (error) {
      toast.error("❌ Error saving file tree");
      console.error("Save file tree error:", error);
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row">
      {/* Left Panel */}
      <div className="left w-full md:w-1/4 h-[60vh] md:h-screen bg-black relative flex flex-col">
        <div
          className="h-12 md:h-[9vh] bg-[#1e1e1e] relative cursor-pointer flex items-center "
          onClick={() => showsidepnl(!sidepnl)}
        >
          <img
            src={collabIcon}
            className="w-6 h-6 absolute right-6 top-3  md:right-5 md:top-auto"
            alt=""
          />
        </div>

        <div
          ref={messageBox}
          className="messages flex-1 overflow-y-auto relative px-2 py-1 pb-20"
        >
          {messages.map((msg, index) => {
            const isAI = msg.sender === "ai" || msg.sender?._id === "ai";
            const isLastMessage = index === messages.length - 1;
            return (
              <div
                key={index}
                className={`
                  ${msg.sender === user._id ? "outgoing" : "incoming"}
                  w-fit max-w-[90vw] md:max-w-[80%] px-2 py-2 rounded-md
                  ${msg.sender === user._id ? "m-2" : "ml-auto m-2"}
                  ${isLastMessage ? "mb-6" : ""}
                  flex flex-col
                  ${isAI ? "bg-[#282828] text-white" : "bg-white text-black"}
                  text-xs sm:text-sm md:text-base
                `}
              >
                <div className="sender text-xs md:text-sm">
                  <p className="text-gray-600 text-[10px] md:text-[12px]">
                    {users.find(
                      (u) =>
                        u._id &&
                        msg.sender &&
                        u._id.toString() === msg.sender.toString()
                    )?.name || "AI"}
                  </p>
                </div>
                <div className="message break-words">
                  {isAI ? (
                    writeAImessage(msg.message)
                  ) : (
                    <div>{msg.message}</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* AI Loading Indicator */}
          {isAIGenerating && (
            <div className="mb-6">
              <AILoadingIndicator />
            </div>
          )}

          {/* Collaborator Side Panel */}
          <div
            className={`sidepanel w-[90vw] sm:w-[80vw] md:w-[80%] h-full absolute top-0 left-0 bg-[#1e1e1e] transition-transform duration-300 ease-in-out z-20 ${
              sidepnl ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="collaborators flex flex-col gap-3 p-3 ">
              <div className="w-full rounded text-xs p-2 bg-black text-white text-center">
                Collaborators
              </div>
              {users.map((user) => {
                const isActive =
                  userCursors[user._id] &&
                  Date.now() - userCursors[user._id].timestamp < 10000;
                const currentFile = userCursors[user._id]?.fileName;

                return (
                  <div
                    key={user._id}
                    className={`w-full rounded text-xs p-2 flex items-center gap-2 ${
                      isActive
                        ? "bg-green-100 border border-green-400"
                        : "bg-white"
                    }`}
                  >
                    <div className="relative">
                      <img src={profIcon} alt="" className="w-6 h-6" />
                      {isActive && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <p className="font-medium">{user.name}</p>
                      {isActive && currentFile && (
                        <p className="text-xs text-gray-600">
                          Editing: {currentFile}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="bottom-0 bg-white mb-2 text-[10px] flex text-center justify-center w-full relative">
                Project ID : {projectId}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#00cf98d9] h-12 md:h-[8vh] absolute bottom-0 left-0 right-0 flex items-center px-2 gap-2 z-10">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-[#1e1e1e] h-10 w-4/5 pl-2.5 border-[#00cf98d9] text-amber-50 rounded text-xs sm:text-sm md:text-base"
            type="text"
            placeholder={
              isAIGenerating ? "AI is generating response..." : "Enter Message"
            }
            disabled={isAIGenerating}
          />
          <button
            onClick={send}
            disabled={isAIGenerating}
            className={`w-8 h-8 flex items-center justify-center ${
              isAIGenerating
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer"
            }`}
          >
            {isAIGenerating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <img src={sendIcon} alt="" className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="right w-full md:w-3/4 h-[60vh] md:h-screen bg-[#1e1e1e] flex flex-col md:flex-row">
        {/* File Explorer */}
        <div className="explorer h-32 md:h-full w-full md:w-1/5 bg-[#282828] overflow-x-auto">
          <div className="file_tree flex flex-row md:flex-col text-center gap-1 m-auto pt-1">
            {Object.keys(fileTree).map((file, index) => (
              <div
                key={index}
                onClick={() => {
                  setCurrentFile(file);
                  setOpenFiles((prev) =>
                    prev.includes(file) ? prev : [...prev, file]
                  );

                  // Broadcast file selection to other users
                  sendMessage("file-select", {
                    fileName: file,
                    userId: user._id,
                    userName: user.name,
                  });
                }}
                className="tree_element cursor-pointer bg-[#161616] font-bold px-2 py-1 text-[#8b8b8b] gap-1 text-xs sm:text-sm md:text-base"
              >
                <p className="truncate max-w-[100px] md:max-w-none">{file}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Code Editor + Run/Save */}
        {currentFile ? (
          <div className="code_editor flex flex-col h-64 md:h-full w-full md:w-4/5">
            <div className="top flex flex-wrap justify-between items-center bg-[#1e1e1e] px-2 py-1 border-b border-gray-700">
              {/* Sync indicator */}
              {isReceivingChange && (
                <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-green-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Syncing...</span>
                </div>
              )}
              {/* File tabs */}
              <div className="flex overflow-x-auto">
                {openFiles.map((item, index) => {
                  // Find users currently editing this file
                  const editingUsers = Object.entries(userCursors)
                    .filter(([, cursorData]) => cursorData.fileName === item)
                    .map(([, cursorData]) => cursorData.userName);

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentFile(item);

                        // Broadcast file selection to other users
                        sendMessage("file-select", {
                          fileName: item,
                          userId: user._id,
                          userName: user.name,
                        });
                      }}
                      className={`px-2 py-1 text-xs sm:text-sm whitespace-nowrap font-medium rounded-t relative ${
                        currentFile === item
                          ? "bg-[#252526] text-white border-b-2 border-[#1ce3ad]"
                          : "bg-[#1e1e1e] text-gray-400 hover:bg-[#2d2d2d]"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{item}</span>
                        {editingUsers.length > 0 && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-xs text-green-400">
                              {editingUsers.join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Buttons */}
              <div className="flex gap-2 mt-2 md:mt-0">
                <button
                  onClick={async () => {
                    if (!webContainer)
                      return toast.error("WebContainer not ready");
                    if (!currentFile) return toast.error("No file selected");

                    // Detect language by file extension
                    const ext = currentFile.split(".").pop();
                    let runCmd = null;
                    let runArgs = [];
                    let preCmd = null;
                    let preArgs = [];
                    let needsPackageJson = false;
                    let outputLabel = "";

                    switch (ext) {
                      case "js":
                        needsPackageJson = true;
                        runCmd = "npm";
                        runArgs = ["start"];
                        preCmd = "npm";
                        preArgs = ["install"];
                        outputLabel = "Node.js";
                        break;
                      case "cpp":
                        // g++ file.cpp -o file && ./file
                        preCmd = "g++";
                        preArgs = [currentFile, "-o", "a.out"];
                        runCmd = "./a.out";
                        runArgs = [];
                        outputLabel = "C++";
                        break;
                      case "py":
                        runCmd = "python";
                        runArgs = [currentFile];
                        outputLabel = "Python";
                        break;
                      case "java":
                        // javac file.java && java file (without .java)
                        preCmd = "javac";
                        preArgs = [currentFile];
                        runCmd = "java";
                        runArgs = [currentFile.replace(/\.java$/, "")];
                        outputLabel = "Java";
                        break;
                      default:
                        toast.error(`Unsupported file type: .${ext}`);
                        return;
                    }

                    if (needsPackageJson && !fileTree["package.json"]) {
                      return toast.error("package.json is missing");
                    }

                    try {
                      setIsRunning(true);
                      await webContainer.mount(fileTree);

                      // Pre-command (build step)
                      if (preCmd) {
                        const preProcess = await webContainer.spawn(
                          preCmd,
                          preArgs
                        );
                        preProcess.output.pipeTo(
                          new WritableStream({
                            write(chunk) {
                              console.log(`🔧 ${preCmd} output:`, chunk);
                            },
                          })
                        );
                        await preProcess.exit;
                        console.log(`✅ ${preCmd} finished`);
                      }

                      // Kill previous run process if any
                      if (runProcess) await runProcess.kill();

                      // Run main command
                      const newRunProcess = await webContainer.spawn(
                        runCmd,
                        runArgs
                      );
                      setRunProcess(newRunProcess);
                      newRunProcess.output.pipeTo(
                        new WritableStream({
                          write(chunk) {
                            console.log(`🚀 ${outputLabel} output:`, chunk);
                          },
                        })
                      );
                      console.log(`✅ ${outputLabel} program started`);
                    } catch (error) {
                      console.error(`❌ ${outputLabel} run failed`, error);
                      toast.error(
                        `${outputLabel} run failed: check console logs`
                      );
                    } finally {
                      setIsRunning(false);
                    }
                  }}
                  className={`${
                    isRunning
                      ? "bg-gray-500 cursor-not-allowed"
                      : "bg-[#1cdfabce] hover:bg-green-700"
                  } text-white px-2 sm:px-4 py-1 rounded shadow flex items-center justify-center text-xs sm:text-sm`}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <svg
                      className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      ></path>
                    </svg>
                  ) : (
                    "Run"
                  )}
                </button>

                <button
                  onClick={() => saveFileTree()}
                  className="bg-black hover:bg-gray-800 text-white px-2 sm:px-4 py-1 rounded shadow text-xs sm:text-sm"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="bottom bg-white h-40 md:h-full flex flex-grow w-full relative">
              {/* User cursor indicators */}
              {Object.entries(userCursors).map(([userId, cursorData]) => (
                <UserCursorIndicator
                  key={userId}
                  userName={cursorData.userName}
                  fileName={cursorData.fileName}
                  position={cursorData.position}
                />
              ))}

              {fileTree[currentFile] ? (
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  language={
                    currentFile.endsWith(".js")
                      ? "javascript"
                      : currentFile.endsWith(".json")
                      ? "json"
                      : currentFile.endsWith(".css")
                      ? "css"
                      : currentFile.endsWith(".cpp")
                      ? "cpp"
                      : "plaintext"
                  }
                  beforeMount={(monaco) => {
                    // Disable all diagnostics
                    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
                      {
                        noSemanticValidation: true,
                        noSyntaxValidation: true,
                      }
                    );
                    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(
                      {
                        noSemanticValidation: true,
                        noSyntaxValidation: true,
                      }
                    );
                    // (Your C++ disabling code here, if any)
                  }}
                  value={fileTree[currentFile].file.contents}
                  onChange={(value) => {
                    // Don't update if we're receiving a change from another user
                    if (isReceivingChange) return;

                    setFileTree({
                      ...fileTree,
                      [currentFile]: {
                        ...fileTree[currentFile],
                        file: {
                          ...fileTree[currentFile].file,
                          contents: value,
                        },
                      },
                    });

                    // Broadcast code change to other users
                    sendMessage("code-change", {
                      fileName: currentFile,
                      content: value,
                      userId: user._id,
                      userName: user.name,
                    });
                  }}
                  onMount={(editor) => {
                    // Set up cursor position tracking
                    editor.onDidChangeCursorPosition((e) => {
                      sendMessage("cursor-change", {
                        fileName: currentFile,
                        position: e.position,
                        userId: user._id,
                        userName: user.name,
                      });
                    });
                  }}
                  theme="vs-dark"
                />
              ) : (
                <div></div>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden md:block flex-1"></div>
        )}

        {/* Iframe Preview */}
        {iframeURL &&
          webContainer &&
          (iframeExpanded ? (
            // Overlay mode
            <div
              className="fixed top-0 left-0 w-[60vw] h-[90vh] z-50 bg-[#1e1e1e] border-l border-gray-700 transition-all duration-300 flex flex-col"
              style={{
                right: 0,
                margin: "auto",
                borderRadius: "8px",
                boxShadow: "0 0 40px 10px #1ce3ad33",
              }}
            >
              <div className="address-bar w-full bg-[#252526] border-b border-gray-700 p-2 flex items-center gap-2">
                <input
                  onChange={(e) => setIframeURL(e.target.value)}
                  type="text"
                  value={iframeURL}
                  className="bg-[#1e1e1e] text-gray-300 border border-gray-600 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#1cdfabce] text-xs sm:text-sm"
                  placeholder="Preview URL"
                />
                <button
                  onClick={() => setIframeExpanded(false)}
                  className="bg-[#1ce3ad] text-black px-2 py-1 rounded hover:bg-[#00cf98d9] transition text-xs"
                >
                  Minimize
                </button>
              </div>
              <iframe
                className="w-full h-full bg-white border-none rounded-b shadow-inner"
                src={iframeURL}
                title="Live Preview"
              />
            </div>
          ) : (
            // Normal mode
            <div
              className="flex flex-col h-40 md:h-full border-t md:border-t-0 md:border-l border-gray-700 bg-[#1e1e1e] transition-all duration-300"
              style={{
                width: "100%",
                maxWidth: "100%",
              }}
            >
              <div className="address-bar w-full bg-[#252526] border-b border-gray-700 p-2 flex-col justify-between items-center gap-2">
                <div>
                  <input
                    onChange={(e) => setIframeURL(e.target.value)}
                    type="text"
                    value={iframeURL}
                    className="bg-[#1e1e1e] text-gray-300 border border-gray-600 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#1cdfabce] text-xs sm:text-sm w-[50%]"
                    placeholder="Preview URL"
                  />
                </div>
                <div>
                  <button
                    onClick={() => setIframeExpanded(true)}
                    className="bg-[#1ce3ad] text-black px-2 py-1 rounded hover:bg-[#00cf98d9] transition text-xs"
                  >
                    Max
                  </button>
                </div>
              </div>
              <iframe
                className="w-full h-full bg-white border-none rounded-b shadow-inner"
                src={iframeURL}
                title="Live Preview"
              />
            </div>
          ))}
      </div>
    </div>
  );
};

export default Project;
