// Supabase Configuration for NovelShare
// This file handles all Supabase authentication and database operations

const SUPABASE_URL = 'https://dakeojhwurvhstxiuzsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRha2Vvamh3dXJ2aHN0eGl1enNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTc1OTgsImV4cCI6MjA4MDE5MzU5OH0.087Hz8XWS-PxRxdNQ1oW_tb9UQKom6YNNYJyKfQIMI4';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

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

  async getNovelById(novelId) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .eq('id', novelId)
      .single();

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

      // Convert to local format
      const localFormat = cloudLibrary.map(item => ({
        novelId: item.novel_id,
        title: item.novels?.title || 'Unknown',
        author: item.novels?.author || 'Unknown',
        coverImage: item.novels?.cover_image || null,
        totalChapters: item.novels?.total_chapters || 0,
        currentChapter: item.current_chapter,
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

  // Full sync on login
  async fullSync() {
    await Promise.all([
      this.syncLibrary(),
      this.syncHistory()
    ]);
  }
};

// Export for use in other files
window.SupabaseAuth = SupabaseAuth;
window.SupabaseDB = SupabaseDB;
window.SupabaseSync = SupabaseSync;
window.supabaseClient = supabase;

console.log('Supabase initialized successfully');
