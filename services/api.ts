import { User } from '../types';

// 開發模式下透過 Vite proxy 轉發 /api，生產環境可透過環境變數指定
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Helper to handle fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 3000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

// ========== 健康檢查 / 連線狀態 ==========

export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const res = await fetchWithTimeout(`${API_URL}/health`, {}, 2000);
    return res.ok;
  } catch {
    return false;
  }
};

// ========== 使用者相關 ==========

export const createUser = async (name: string, avatar: string, grade: string, gender: string): Promise<User> => {
  try {
    const res = await fetchWithTimeout(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar, grade, gender }),
    }, 3000);

    if (!res.ok) throw new Error('Failed to create user');
    return res.json();
  } catch (error) {
    console.warn("Backend unreachable, falling back to LocalStorage.", error);

    const users: User[] = JSON.parse(localStorage.getItem('sel_users') || '[]');
    const newUser: User = { id: Date.now(), name, avatar, grade, gender };
    users.push(newUser);
    localStorage.setItem('sel_users', JSON.stringify(users));
    return newUser;
  }
};

// ========== 回答提交 ==========

export const submitResponse = async (userId: number, questionId: number, score: number) => {
  try {
    const res = await fetchWithTimeout(`${API_URL}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, question_id: questionId, score }),
    }, 2000);

    if (!res.ok) throw new Error('Failed to submit response');
    return res.json();
  } catch (error) {
    const responses = JSON.parse(localStorage.getItem('sel_responses') || '[]');
    responses.push({
      id: Date.now(),
      user_id: userId,
      question_id: questionId,
      score,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('sel_responses', JSON.stringify(responses));
    return { id: Date.now(), status: 'saved_local' };
  }
};

// ========== 管理員：取得所有回答 ==========

export const fetchAllResponses = async () => {
  try {
    const res = await fetchWithTimeout(`${API_URL}/admin/responses`, {}, 5000);
    if (!res.ok) throw new Error('Failed to fetch responses');
    const data = await res.json();
    return { source: 'DB', data };
  } catch (error) {
    console.warn("Backend unreachable, returning LocalStorage data.");
    const users: User[] = JSON.parse(localStorage.getItem('sel_users') || '[]');
    const responses: any[] = JSON.parse(localStorage.getItem('sel_responses') || '[]');

    const joined = responses.map(r => {
      const user = users.find(u => u.id === r.user_id);
      return {
        user_id: user ? user.id : -1,
        user_name: user ? user.name : 'Unknown (Local)',
        user_avatar: user ? user.avatar : '🙂',
        user_grade: user ? user.grade : '',
        user_gender: user ? user.gender : '',
        question_id: r.question_id,
        score: r.score,
        timestamp: r.timestamp
      };
    });

    const sorted = joined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { source: 'LOCAL', data: sorted };
  }
};

// ========== 取得單一使用者的回答（從資料庫） ==========

export const fetchUserResponses = async (userId: number) => {
  try {
    const res = await fetchWithTimeout(`${API_URL}/users/${userId}/responses`, {}, 3000);
    if (!res.ok) throw new Error('Failed to fetch user responses');
    const data = await res.json();
    return { source: 'DB', data };
  } catch (error) {
    console.warn("Backend unreachable, returning LocalStorage data for user.");
    const responses: any[] = JSON.parse(localStorage.getItem('sel_responses') || '[]');
    const userResponses = responses
      .filter(r => r.user_id === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { source: 'LOCAL', data: userResponses };
  }
};

// ========== 將本地資料同步到資料庫 ==========

export const syncLocalToServer = async (): Promise<{ synced_users: number; synced_responses: number }> => {
  const localUsers: User[] = JSON.parse(localStorage.getItem('sel_users') || '[]');
  const localResponses: any[] = JSON.parse(localStorage.getItem('sel_responses') || '[]');

  if (localUsers.length === 0 && localResponses.length === 0) {
    return { synced_users: 0, synced_responses: 0 };
  }

  const res = await fetchWithTimeout(`${API_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: localUsers, responses: localResponses }),
  }, 10000);

  if (!res.ok) throw new Error('Sync failed');

  const result = await res.json();

  // 同步成功後清除本地資料
  localStorage.removeItem('sel_users');
  localStorage.removeItem('sel_responses');

  return result;
};

// ========== 清除本地暫存 ==========

export const clearLocalData = () => {
    localStorage.removeItem('sel_users');
    localStorage.removeItem('sel_responses');
};
