# Collaborative Code Editing Test Guide

## How to Test the Collaborative Editing Feature

### Prerequisites

1. Make sure both backend and frontend servers are running
2. Have at least 2 users registered in the system
3. Create a project with multiple users

### Testing Steps

#### 1. Start the Servers

```bash
# Backend (Terminal 1)
cd backend
npm start

# Frontend (Terminal 2)
cd frontend
npm run dev
```

#### 2. Test Basic Collaboration

1. **User A**: Open the project in one browser tab
2. **User B**: Open the same project in another browser tab (or incognito mode)
3. **User A**: Generate some code using AI (type `@ai create a simple HTML page`)
4. **User B**: Should see the generated code appear automatically
5. **User A**: Edit the code in the editor
6. **User B**: Should see the changes in real-time

#### 3. Test File Selection Sync

1. **User A**: Click on a file in the file explorer
2. **User B**: Should see the same file become active
3. **User A**: Switch between different files
4. **User B**: Should follow the file selection

#### 4. Test Cursor Position Tracking

1. **User A**: Move the cursor around in the editor
2. **User B**: Should see User A's cursor position with their name
3. **User B**: Move their cursor
4. **User A**: Should see User B's cursor position

#### 5. Test Visual Indicators

1. Check the file tabs - they should show who is editing each file
2. Check the collaborators panel - active users should be highlighted
3. Look for the "Syncing..." indicator when changes are being synchronized

#### 6. Test Conflict Resolution

1. **User A** and **User B**: Try editing the same file simultaneously
2. The system should handle conflicts gracefully with debouncing
3. The last change should win (simple conflict resolution)

### Expected Behavior

✅ **Code Changes**: When one user edits code, it appears on all other users' screens in real-time

✅ **File Selection**: When one user selects a file, all other users see the same file become active

✅ **Cursor Tracking**: Users can see each other's cursor positions with names

✅ **Visual Indicators**:

- File tabs show who is editing each file
- Collaborators panel shows active users
- Sync indicator appears during changes

✅ **Conflict Resolution**: Simultaneous edits are handled with debouncing

### Troubleshooting

**If changes don't sync:**

- Check browser console for errors
- Verify Socket.IO connection is established
- Check that both users are in the same project room

**If cursors don't appear:**

- Check that cursor position tracking is enabled
- Verify user names are being passed correctly

**If performance is slow:**

- The debounce timer can be adjusted (currently 300ms)
- Check network latency between users

### Technical Details

The collaborative editing feature uses:

- **Socket.IO** for real-time communication
- **Monaco Editor** for code editing with cursor tracking
- **Debouncing** for conflict resolution
- **Last-write-wins** strategy for handling simultaneous edits
- **Visual indicators** for better user experience

### Next Steps for Enhancement

1. **Operational Transform (OT)**: For more sophisticated conflict resolution
2. **User Presence**: Show when users are online/offline
3. **Change History**: Track and display edit history
4. **Permissions**: Different user roles and edit permissions
5. **File Locking**: Prevent conflicts by locking files being edited
