// Supabase Configuration for NovelShare
// This file handles all Supabase authentication and database operations

const SUPABASE_URL = 'https://dakeojhwurvhstxiuzsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRha2Vvamh3dXJ2aHN0eGl1enNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTc1OTgsImV4cCI6MjA4MDE5MzU5OH0.087Hz8XWS-PxRxdNQ1oW_tb9UQKom6YNNYJyKfQIMI4';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// Offline Sync Queue System
// ============================================

const SyncQueue = {
  QUEUE_KEY: 'novelshare_sync_queue',

  // Get current queue
  getQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  // Save queue
  saveQueue(queue) {
    try {
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save sync queue:', e);
    }
  },

  // Add operation to queue
  add(operation) {
    const queue = this.getQueue();
    queue.push({
      ...operation,
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      retries: 0
    });
    this.saveQueue(queue);
  },

  // Remove operation from queue
  remove(operationId) {
    const queue = this.getQueue().filter(op => op.id !== operationId);
    this.saveQueue(queue);
  },

  // Clear entire queue
  clear() {
    localStorage.removeItem(this.QUEUE_KEY);
  },

  // Get queue length
  length() {
    return this.getQueue().length;
  }
};

// ============================================
// Network Status Detection
// ============================================

const NetworkStatus = {
  _listeners: [],
  _isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  init() {
    window.addEventListener('online', () => {
      this._isOnline = true;
      this._notifyListeners('online');
      // Auto-process queue when back online
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.processQueue) {
        SupabaseSync.processQueue();
      }
    });

    window.addEventListener('offline', () => {
      this._isOnline = false;
      this._notifyListeners('offline');
    });
  },

  isOnline() {
    return this._isOnline && navigator.onLine;
  },

  onStatusChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  },

  _notifyListeners(status) {
    this._listeners.forEach(cb => cb(status));
  }
};

// Initialize network status detection
NetworkStatus.init();

// ============================================
// Authentication Functions
// ============================================

const SupabaseAuth = {
  // Get current user
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  // Get current session
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  // Sign up with email and password
  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
          display_name: username
        }
      }
    });

    if (error) throw error;

    // Create user profile in profiles table
    if (data.user) {
      await SupabaseDB.createProfile(data.user.id, username, email);
    }

    return data;
  },

  // Sign in with email and password
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Sign in with Google
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/pages/home.html'
      }
    });

    if (error) throw error;
    return data;
  },

  // Send password reset email
  async resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/pages/reset-password.html'
    });

    if (error) throw error;
    return data;
  },

  // Update password
  async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
    return data;
  },

  // Listen for auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },

  // Check if user is logged in
  async isLoggedIn() {
    const session = await this.getSession();
    return !!session;
  }
};

// ============================================
// Database Functions
// ============================================

const SupabaseDB = {
  // --- Profiles ---
  async createProfile(userId, username, email) {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: username,
        email: email,
        bio: 'New NovelShare member',
        created_at: new Date().toISOString()
      });

    if (error && error.code !== '23505') throw error; // Ignore duplicate key error
    return data;
  },

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // Update profile
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- Novels ---
  async getNovels(limit = 20, offset = 0) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  },

  async upsertNovel(novel) {
    if (!novel || !novel.title) return null;
    const payload = {
      title: novel.title,
      description: novel.description || '',
      cover_image: novel.cover_image || novel.cover || null,
      genres: novel.genres || (novel.genre ? [novel.genre] : []),
      status: (novel.status || 'ongoing').toLowerCase(),
      total_chapters: novel.total_chapters || novel.totalChapters || novel.chapters || 0,
      author_id: novel.author_id || novel.authorId || null,
      author: novel.author || 'Unknown'
    };
    if (novel.id) payload.id = novel.id;
    const { data, error } = await supabase.from('novels').upsert(payload).select().limit(1);
    if (error) throw error;
    return data?.[0] || null;
  },

  async getNovelById(novelId) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .eq('id', novelId)
      .single();

    if (error) throw error;
    return data;
  },

  async getNovelsByAuthor(authorId, limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .eq('author_id', authorId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  },

  async deleteNovels(ids = [], authorId) {
    if (!ids.length) return [];
    let query = supabase.from('novels').delete().in('id', ids);
    if (authorId) query = query.eq('author_id', authorId);
    const { data, error } = await query.select('id');
    if (error) throw error;
    return data;
  },

  async searchNovels(query) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(20);

    if (error) throw error;
    return data;
  },

  async getNovelsByGenre(genre) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .contains('genres', [genre])
      .limit(20);

    if (error) throw error;
    return data;
  },

  // --- Chapters ---
  async getChapters(novelId) {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('novel_id', novelId)
      .order('chapter_number', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getChapter(novelId, chapterNumber) {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('novel_id', novelId)
      .eq('chapter_number', chapterNumber)
      .single();

    if (error) throw error;
    return data;
  },

  async getChapterById(novelId, chapterId) {
    const query = supabase.from('chapters').select('*').eq('novel_id', novelId).eq('id', chapterId).single();
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async upsertChapter(chapter) {
    if (!chapter || !chapter.novel_id) throw new Error('Chapter requires novel_id');
    const payload = {
      novel_id: chapter.novel_id,
      title: chapter.title || '',
      content: chapter.content || '',
      status: chapter.status || 'draft',
      chapter_number: chapter.chapter_number || chapter.number || chapter.order || 1,
      author_id: chapter.author_id || null,
      updated_at: chapter.updated_at || new Date().toISOString(),
    };
    if (chapter.id) payload.id = chapter.id;
    const { data, error } = await supabase.from('chapters').upsert(payload).select().limit(1);
    if (error) throw error;
    return data?.[0] || null;
  },

  async deleteChapter(novelId, chapterId) {
    const { data, error } = await supabase
      .from('chapters')
      .delete()
      .eq('novel_id', novelId)
      .eq('id', chapterId)
      .select('id');

    if (error) throw error;
    return data;
  },

  // --- User Library ---
  async getUserLibrary(userId) {
    const { data, error } = await supabase
      .from('user_library')
      .select(`
        *,
        novels (*)
      `)
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async addToLibrary(userId, novelId) {
    const { data, error } = await supabase
      .from('user_library')
      .insert({
        user_id: userId,
        novel_id: novelId,
        current_chapter: 0,
        added_at: new Date().toISOString()
      });

    if (error && error.code !== '23505') throw error;
    return data;
  },

  async removeFromLibrary(userId, novelId) {
    const { data, error } = await supabase
      .from('user_library')
      .delete()
      .eq('user_id', userId)
      .eq('novel_id', novelId);

    if (error) throw error;
    return data;
  },

  async updateReadingProgress(userId, novelId, currentChapter) {
    const { data, error } = await supabase
      .from('user_library')
      .update({
        current_chapter: currentChapter,
        last_read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('novel_id', novelId);

    if (error) throw error;
    return data;
  },

  async isInLibrary(userId, novelId) {
    const { data, error } = await supabase
      .from('user_library')
      .select('id')
      .eq('user_id', userId)
      .eq('novel_id', novelId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  // --- Reading History ---
  async addToHistory(userId, novelId, chapterId, chapterTitle) {
    const { data, error } = await supabase
      .from('reading_history')
      .upsert({
        user_id: userId,
        novel_id: novelId,
        chapter_id: chapterId,
        chapter_title: chapterTitle,
        read_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,novel_id'
      });

    if (error) throw error;
    return data;
  },

  async getReadingHistory(userId, limit = 20) {
    const { data, error } = await supabase
      .from('reading_history')
      .select(`
        *,
        novels (*)
      `)
      .eq('user_id', userId)
      .order('read_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  async clearHistory(userId) {
    const { data, error } = await supabase
      .from('reading_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  },

  // --- Bookmarks ---
  async addBookmark(userId, novelId, chapterId, note = '') {
    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        user_id: userId,
        novel_id: novelId,
        chapter_id: chapterId,
        note: note,
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    return data;
  },

  async getBookmarks(userId) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select(`
        *,
        novels (*),
        chapters (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async removeBookmark(bookmarkId) {
    const { data, error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', bookmarkId);

    if (error) throw error;
    return data;
  },

  // --- Ratings ---
  async rateNovel(userId, novelId, rating) {
    const { data, error } = await supabase
      .from('ratings')
      .upsert({
        user_id: userId,
        novel_id: novelId,
        rating: rating,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,novel_id'
      });

    if (error) throw error;
    return data;
  },

  async getUserRating(userId, novelId) {
    const { data, error } = await supabase
      .from('ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('novel_id', novelId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.rating || null;
  },

  async getNovelAverageRating(novelId) {
    const { data, error } = await supabase
      .from('ratings')
      .select('rating')
      .eq('novel_id', novelId);

    if (error) throw error;

    if (!data || data.length === 0) return null;

    const sum = data.reduce((acc, r) => acc + r.rating, 0);
    return (sum / data.length).toFixed(1);
  },

  // --- Following Authors ---
  async followAuthor(userId, authorId) {
    const { data, error } = await supabase
      .from('follows')
      .insert({
        follower_id: userId,
        following_id: authorId,
        created_at: new Date().toISOString()
      });

    if (error && error.code !== '23505') throw error;
    return data;
  },

  async unfollowAuthor(userId, authorId) {
    const { data, error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', authorId);

    if (error) throw error;
    return data;
  },

  async isFollowing(userId, authorId) {
    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', authorId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  async getFollowing(userId) {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        *,
        profiles!follows_following_id_fkey (*)
      `)
      .eq('follower_id', userId);

    if (error) throw error;
    return data;
  }
};

// ============================================
// Helper function to sync with existing localStorage system
// ============================================

const SupabaseSync = {
  // Sync local library with Supabase
  async syncLibrary() {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return;

    try {
      const cloudLibrary = await SupabaseDB.getUserLibrary(user.id);
      const cloudIds = new Set(cloudLibrary.map(item => item.novel_id));
      const localLibrary = JSON.parse(localStorage.getItem('novelshare_library') || '[]');

      // Push any local items that are missing in cloud (one-time catch-up)
      const missing = localLibrary.filter(item => !cloudIds.has(item.novelId || item.id));
      for (const item of missing) {
        try {
          await this.pushLibraryItem(item.novelId || item.id, 'add', item);
        } catch (e) {
          console.warn('Failed to push local library item:', e);
        }
      }

      // Convert to local format (include all fields needed for display)
      const localFormat = cloudLibrary.map(item => ({
        id: item.novel_id,
        novelId: item.novel_id,
        title: item.novels?.title || 'Unknown',
        author: item.novels?.author || 'Unknown',
        cover: item.novels?.cover_image || null,
        coverImage: item.novels?.cover_image || null,
        genre: Array.isArray(item.novels?.genres) ? item.novels.genres[0] : (item.novels?.genre || ''),
        status: item.novels?.status || 'ongoing',
        description: item.novels?.description || '',
        rating: item.novels?.rating || item.novels?.avg_rating || 0,
        totalChapters: item.novels?.total_chapters || 0,
        chapters: item.novels?.total_chapters || 0,
        currentChapter: item.current_chapter || 0,
        progress: item.progress || 0,
        addedAt: new Date(item.added_at).getTime()
      }));

      // Update localStorage
      localStorage.setItem('novelshare_library', JSON.stringify(localFormat));

      return localFormat;
    } catch (error) {
      console.error('Failed to sync library:', error);
      return null;
    }
  },

  // Sync reading history
  async syncHistory() {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return;

    try {
      const cloudHistory = await SupabaseDB.getReadingHistory(user.id);

      const localFormat = cloudHistory.map(item => ({
        novelId: item.novel_id,
        chapterId: item.chapter_id,
        novelTitle: item.novels?.title || 'Unknown',
        chapterTitle: item.chapter_title,
        coverImage: item.novels?.cover_image || null,
        timestamp: new Date(item.read_at).getTime()
      }));

      localStorage.setItem('novelshare_history', JSON.stringify(localFormat));

      return localFormat;
    } catch (error) {
      console.error('Failed to sync history:', error);
      return null;
    }
  },

  // Sync bookmarks
  async syncBookmarks() {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return;

    try {
      const cloudBookmarks = await SupabaseDB.getBookmarks(user.id);
      const localFormat = cloudBookmarks.map(b => ({
        id: b.id,
        novelId: b.novel_id,
        chapterId: b.chapter_id,
        note: b.note || '',
        novelTitle: b.novels?.title || '',
        chapterTitle: b.chapters?.title || '',
        createdAt: new Date(b.created_at).getTime()
      }));
      localStorage.setItem('novelshare_bookmarks', JSON.stringify(localFormat));
      return localFormat;
    } catch (error) {
      console.error('Failed to sync bookmarks:', error);
      return null;
    }
  },

  // Full sync on login
  async fullSync() {
    await Promise.all([
      this.syncLibrary(),
      this.syncHistory(),
      this.syncBookmarks()
    ]);
  },

  // ============================================
  // PUSH Functions (Local → Cloud)
  // ============================================

  // Push library item to cloud
  async pushLibraryItem(novelId, action = 'add') {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      const novelData = arguments.length > 2 ? arguments[2] : undefined;
      SyncQueue.add({ type: 'library', novelId, action, userId: user.id, novelData });
      return { queued: true };
    }

    try {
      // Best-effort upsert of novel to avoid FK errors
      if (action === 'add' && arguments.length > 2) {
        const novelData = arguments[2] || {};
        const upsertPayload = {
          id: novelId,
          title: novelData.title,
          author: novelData.author,
          cover_image: novelData.coverImage || novelData.cover,
          total_chapters: novelData.totalChapters,
          status: novelData.status,
          genres: novelData.genre ? [novelData.genre] : []
        };
        try {
          await SupabaseDB.upsertNovel(upsertPayload);
        } catch (e) {
          console.warn('Novel upsert failed (continuing):', e);
        }
      }

      if (action === 'add') {
        await SupabaseDB.addToLibrary(user.id, novelId);
      } else if (action === 'remove') {
        await SupabaseDB.removeFromLibrary(user.id, novelId);
      }
      return { success: true };
    } catch (error) {
      console.error('Push library failed:', error);
      SyncQueue.add({ type: 'library', novelId, action, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push rating to cloud
  async pushRating(novelId, rating) {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'rating', novelId, rating, userId: user.id });
      return { queued: true };
    }

    try {
      await SupabaseDB.rateNovel(user.id, novelId, rating);
      return { success: true };
    } catch (error) {
      console.error('Push rating failed:', error);
      SyncQueue.add({ type: 'rating', novelId, rating, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push bookmark to cloud
  async pushBookmark(novelId, chapterId, note, action = 'add') {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      const novelData = arguments.length > 4 ? arguments[4] : undefined;
      SyncQueue.add({ type: 'bookmark', novelId, chapterId, note, action, userId: user.id, novelData });
      return { queued: true };
    }

    try {
      if (action === 'add' && arguments.length > 4) {
        const novelData = arguments[4] || {};
        try {
          await SupabaseDB.upsertNovel({
            id: novelId,
            title: novelData.title,
            author: novelData.author,
            cover_image: novelData.coverImage || novelData.cover,
            total_chapters: novelData.totalChapters,
            status: novelData.status,
            genres: novelData.genre ? [novelData.genre] : []
          });
        } catch (e) {
          console.warn('Bookmark upsert failed (continuing):', e);
        }
      }
      if (action === 'add') {
        await SupabaseDB.addBookmark(user.id, novelId, chapterId, note);
      }
      return { success: true };
    } catch (error) {
      console.error('Push bookmark failed:', error);
      SyncQueue.add({ type: 'bookmark', novelId, chapterId, note, action, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push reading progress to cloud
  async pushReadingProgress(novelId, currentChapter) {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'progress', novelId, currentChapter, userId: user.id });
      return { queued: true };
    }

    try {
      await SupabaseDB.updateReadingProgress(user.id, novelId, currentChapter);
      return { success: true };
    } catch (error) {
      console.error('Push progress failed:', error);
      SyncQueue.add({ type: 'progress', novelId, currentChapter, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push follow/unfollow to cloud
  async pushFollow(authorId, action = 'follow') {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'follow', authorId, action, userId: user.id });
      return { queued: true };
    }

    try {
      if (action === 'follow') {
        await SupabaseDB.followAuthor(user.id, authorId);
      } else {
        await SupabaseDB.unfollowAuthor(user.id, authorId);
      }
      return { success: true };
    } catch (error) {
      console.error('Push follow failed:', error);
      SyncQueue.add({ type: 'follow', authorId, action, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push history entry to cloud
  async pushHistoryEntry(novelId, chapterId, chapterTitle) {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      const novelData = arguments.length > 3 ? arguments[3] : undefined;
      SyncQueue.add({ type: 'history', novelId, chapterId, chapterTitle, userId: user.id, novelData });
      return { queued: true };
    }

    try {
      if (arguments.length > 3) {
        const novelData = arguments[3] || {};
        try {
          await SupabaseDB.upsertNovel({
            id: novelId,
            title: novelData.title,
            author: novelData.author,
            cover_image: novelData.coverImage || novelData.cover,
            total_chapters: novelData.totalChapters,
            status: novelData.status,
            genres: novelData.genre ? [novelData.genre] : []
          });
        } catch (e) {
          console.warn('History upsert failed (continuing):', e);
        }
      }
      await SupabaseDB.addToHistory(user.id, novelId, chapterId, chapterTitle);
      return { success: true };
    } catch (error) {
      console.error('Push history failed:', error);
      const novelData = arguments.length > 3 ? arguments[3] : undefined;
      SyncQueue.add({ type: 'history', novelId, chapterId, chapterTitle, userId: user.id, novelData });
      return { queued: true, error };
    }
  },

  // ============================================
  // Queue Processing
  // ============================================

  async processQueue() {
    if (!NetworkStatus.isOnline()) return { processed: 0, remaining: SyncQueue.length() };

    const queue = SyncQueue.getQueue();
    if (queue.length === 0) return { processed: 0, remaining: 0 };

    console.log(`Processing ${queue.length} queued operations...`);
    let processed = 0;

    for (const operation of queue) {
      try {
        let success = false;

        switch (operation.type) {
          case 'library':
            if (operation.action === 'add') {
              if (operation.novelData) {
                try {
                  await SupabaseDB.upsertNovel(operation.novelData);
                } catch (e) {
                  console.warn('Upsert during queue failed:', e);
                }
              }
              await SupabaseDB.addToLibrary(operation.userId, operation.novelId);
            } else {
              await SupabaseDB.removeFromLibrary(operation.userId, operation.novelId);
            }
            success = true;
            break;

          case 'rating':
            await SupabaseDB.rateNovel(operation.userId, operation.novelId, operation.rating);
            success = true;
            break;

          case 'bookmark':
            if (operation.action === 'add') {
              if (operation.novelData) {
                try {
                  await SupabaseDB.upsertNovel(operation.novelData);
                } catch (e) {
                  console.warn('Upsert during bookmark queue failed:', e);
                }
              }
              await SupabaseDB.addBookmark(operation.userId, operation.novelId, operation.chapterId, operation.note || '');
            }
            success = true;
            break;

          case 'progress':
            await SupabaseDB.updateReadingProgress(operation.userId, operation.novelId, operation.currentChapter);
            success = true;
            break;

          case 'follow':
            if (operation.action === 'follow') {
              await SupabaseDB.followAuthor(operation.userId, operation.authorId);
            } else {
              await SupabaseDB.unfollowAuthor(operation.userId, operation.authorId);
            }
            success = true;
            break;

          case 'history':
            if (operation.novelData) {
              try {
                await SupabaseDB.upsertNovel(operation.novelData);
              } catch (e) {
                console.warn('Upsert during history queue failed:', e);
              }
            }
            await SupabaseDB.addToHistory(operation.userId, operation.novelId, operation.chapterId, operation.chapterTitle);
            success = true;
            break;
        }

        if (success) {
          SyncQueue.remove(operation.id);
          processed++;
        }
      } catch (error) {
        console.error(`Failed to process operation ${operation.id}:`, error);
        // Increment retry count
        const queue = SyncQueue.getQueue();
        const opIndex = queue.findIndex(op => op.id === operation.id);
        if (opIndex !== -1) {
          queue[opIndex].retries = (queue[opIndex].retries || 0) + 1;
          // Remove after 3 failed retries
          if (queue[opIndex].retries >= 3) {
            queue.splice(opIndex, 1);
          }
          SyncQueue.saveQueue(queue);
        }
      }
    }

    console.log(`Queue processing complete. ${processed} processed, ${SyncQueue.length()} remaining.`);
    return { processed, remaining: SyncQueue.length() };
  },

  // ============================================
  // Conflict Detection
  // ============================================

  async detectConflicts() {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { hasConflicts: false, conflicts: [] };

    const conflicts = [];

    try {
      // Check library conflicts
      const localLibrary = JSON.parse(localStorage.getItem('novelshare_library') || '[]');
      const cloudLibrary = await SupabaseDB.getUserLibrary(user.id);

      const localIds = new Set(localLibrary.map(item => item.novelId));
      const cloudIds = new Set(cloudLibrary.map(item => item.novel_id));

      // Items in local but not cloud
      const localOnly = localLibrary.filter(item => !cloudIds.has(item.novelId));
      if (localOnly.length > 0) {
        conflicts.push({
          type: 'library_local_only',
          message: `${localOnly.length} item(s) in local library not synced to cloud`,
          items: localOnly
        });
      }

      // Items in cloud but not local
      const cloudOnly = cloudLibrary.filter(item => !localIds.has(item.novel_id));
      if (cloudOnly.length > 0) {
        conflicts.push({
          type: 'library_cloud_only',
          message: `${cloudOnly.length} item(s) in cloud not in local library`,
          items: cloudOnly
        });
      }

      // Check for pending queue items
      const queueLength = SyncQueue.length();
      if (queueLength > 0) {
        conflicts.push({
          type: 'pending_sync',
          message: `${queueLength} operation(s) pending sync`,
          items: SyncQueue.getQueue()
        });
      }

    } catch (error) {
      console.error('Conflict detection failed:', error);
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts
    };
  },

  // Resolve conflicts by pushing local items to cloud
  async resolveConflicts(strategy = 'push_local') {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    const { conflicts } = await this.detectConflicts();
    let resolved = 0;

    for (const conflict of conflicts) {
      if (conflict.type === 'library_local_only' && strategy === 'push_local') {
        // Push local items to cloud
        for (const item of conflict.items) {
          try {
            await SupabaseDB.addToLibrary(user.id, item.novelId);
            resolved++;
          } catch (e) {
            console.error('Failed to resolve conflict:', e);
          }
        }
      } else if (conflict.type === 'pending_sync') {
        // Process the queue
        const result = await this.processQueue();
        resolved += result.processed;
      }
    }

    return { resolved, remaining: (await this.detectConflicts()).conflicts.length };
  },

  // Get sync status
  getSyncStatus() {
    return {
      isOnline: NetworkStatus.isOnline(),
      queueLength: SyncQueue.length(),
      queue: SyncQueue.getQueue()
    };
  }
};

// Export for use in other files
window.SupabaseAuth = SupabaseAuth;
window.SupabaseDB = SupabaseDB;
window.SupabaseSync = SupabaseSync;
window.SyncQueue = SyncQueue;
window.NetworkStatus = NetworkStatus;
window.supabaseClient = supabase;

console.log('Supabase initialized successfully');
