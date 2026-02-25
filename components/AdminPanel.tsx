import React, { useState, useMemo } from 'react';
import { QUESTIONS } from '../constants';
import { fetchAllResponses, clearLocalData, syncLocalToServer, checkServerHealth } from '../services/api';
import { AdminResponseView } from '../types';
import { Download, Lock, RefreshCcw, Trash2, Database, HardDrive, ArrowLeft, BarChart3, Home, UploadCloud, Wifi, WifiOff } from 'lucide-react';

interface StudentSummary {
  user_id: number;
  name: string;
  avatar: string;
  grade: string;
  gender: string;
  answers: Map<number, number>; // question_id -> score
  last_timestamp: string;
}

const AdminPanel: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [rawData, setRawData] = useState<AdminResponseView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'DB' | 'LOCAL' | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Admin1234') {
      setIsAuthenticated(true);
      loadData();
    } else {
      alert('密碼錯誤 (Wrong password)');
    }
  };

  const handleBack = () => {
    window.location.hash = '';
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const isOnline = await checkServerHealth();
      setServerOnline(isOnline);

      const { source, data: apiData } = await fetchAllResponses();
      setDataSource(source as 'DB' | 'LOCAL');

      // Map apiData (add question text just in case, though we mostly need raw data for processing)
      const enrichedData = apiData.map((row: any) => {
        const question = QUESTIONS.find(q => q.id === row.question_id);
        return {
          ...row,
          question_text: question ? question.text : 'Unknown Question',
        };
      });

      setRawData(enrichedData);
    } catch (err) {
      console.error(err);
      alert('無法載入數據');
    } finally {
      setIsLoading(false);
    }
  };

  // Process raw data into student summaries
  const studentSummaries = useMemo(() => {
    const map = new Map<number, StudentSummary>();

    // rawData is sorted by timestamp DESC from API
    rawData.forEach(row => {
      if (!map.has(row.user_id)) {
        map.set(row.user_id, {
          user_id: row.user_id,
          name: row.user_name,
          avatar: row.user_avatar || '🧑‍🎓',
          grade: row.user_grade,
          gender: row.user_gender,
          answers: new Map<number, number>(),
          last_timestamp: row.timestamp
        });
      }

      const student = map.get(row.user_id)!;
      
      // Since rawData is DESC, the first time we see a question_id, it is the latest answer
      if (!student.answers.has(row.question_id)) {
        student.answers.set(row.question_id, row.score);
      }
      
      // Safety check for latest timestamp
      if (new Date(row.timestamp) > new Date(student.last_timestamp)) {
        student.last_timestamp = row.timestamp;
      }
    });

    return Array.from(map.values());
  }, [rawData]);

  const exportCSV = () => {
    if (studentSummaries.length === 0) {
      alert("沒有資料可以匯出");
      return;
    }

    const allQuestionIds = QUESTIONS.map(q => q.id).sort((a, b) => a - b);
    
    // Helper to escape CSV fields
    const escapeCsvField = (field: any): string => {
      if (field === null || field === undefined) return '';
      const stringField = String(field);
      // If contains comma, double quote, or newline, wrap in quotes and escape internal quotes
      if (/[",\n\r]/.test(stringField)) {
        return `"${stringField.replace(/"/g, '""')}"`;
      }
      return stringField;
    };

    // Header
    const headers = [
      "User ID", "Name", "Grade", "Gender", "Last Active Time",
      ...allQuestionIds.map(id => `Q${id}`),
      "Total Score", "Progress"
    ];

    // Rows
    const rows = studentSummaries.map(s => {
      let totalScore = 0;
      
      const scores = allQuestionIds.map(qid => {
        const score = s.answers.get(qid);
        if (score !== undefined) {
          totalScore += score;
          return score;
        }
        return '';
      });

      const progress = `${s.answers.size}/${QUESTIONS.length}`;
      
      return [
        s.user_id,
        s.name,
        s.grade,
        s.gender,
        s.last_timestamp,
        ...scores,
        totalScore,
        progress
      ].map(escapeCsvField).join(',');
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sel_report_${dataSource === 'DB' ? 'db' : 'local'}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncLocalToServer();
      if (result.synced_users === 0 && result.synced_responses === 0) {
        alert('沒有本地資料需要同步 (No local data to sync)');
      } else {
        alert(`同步成功！已上傳 ${result.synced_users} 位使用者、${result.synced_responses} 筆回答到資料庫。\n(Synced ${result.synced_users} users, ${result.synced_responses} responses to DB)`);
        loadData();
      }
    } catch (err) {
      alert('同步失敗，請確認後端伺服器已啟動。\n(Sync failed - is the backend server running?)');
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearLocal = () => {
    if (confirm('確定要清除所有本機暫存資料嗎？(Clear Local Storage?)')) {
      clearLocalData();
      loadData();
      alert('已清除 (Cleared)');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 relative">
        <button 
            onClick={handleBack}
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold bg-white px-4 py-2 rounded-full shadow-sm hover:shadow-md transition-all"
        >
            <ArrowLeft size={20} /> 回首頁 (Back)
        </button>
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <div className="flex justify-center mb-6 text-pink-500">
            <Lock size={48} />
          </div>
          <h2 className="text-2xl font-bold text-center mb-6">老師專用區 (Admin)</h2>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full p-4 border rounded-xl mb-4 text-xl"
            placeholder="請輸入密碼 (Password)"
          />
          <button className="w-full bg-pink-500 text-white p-4 rounded-xl font-bold text-xl hover:bg-pink-600 transition">
            登入 (Login)
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header Bar */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-blue-100 to-purple-100 p-2 rounded-lg">
                <BarChart3 size={32} className="text-gray-700" />
             </div>
             <h1 className="text-2xl font-bold text-gray-800 tracking-tight">問卷結果管理系統</h1>
          </div>

          <div className="flex items-center gap-3">
             {/* Connection Status */}
             {serverOnline !== null && (
               <span className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold ${serverOnline ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                 {serverOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                 {serverOnline ? '資料庫已連線' : '離線模式'}
               </span>
             )}
             <button
                onClick={handleBack}
                className="flex items-center gap-2 bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
             >
                <Home size={18} /> 回首頁
             </button>
             <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
             >
                <UploadCloud size={18} className={isSyncing ? 'animate-pulse' : ''} /> {isSyncing ? '同步中...' : '同步到資料庫'}
             </button>
             <button
                onClick={handleClearLocal}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
             >
                <Trash2 size={18} /> 清空資料
             </button>
             <button
                onClick={exportCSV}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
             >
                <Download size={18} /> 匯出 CSV (Excel)
             </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 md:p-8">
        
        {dataSource && (
           <div className="mb-6 flex justify-end">
              <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${dataSource === 'DB' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {dataSource === 'DB' ? <Database size={14}/> : <HardDrive size={14}/>}
                {dataSource === 'DB' ? 'Database Mode' : 'Local Storage Mode'}
              </span>
           </div>
        )}

        {/* Main Content Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-5 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-4 pl-4">學生</div>
                <div className="col-span-3">年級 / 性別</div>
                <div className="col-span-3">填答進度</div>
                <div className="col-span-2">總分</div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                    <RefreshCcw className="animate-spin mb-2" size={32} />
                    載入中...
                </div>
            )}

            {/* Empty State */}
            {!isLoading && studentSummaries.length === 0 && (
                 <div className="p-12 text-center text-gray-400">
                    目前還沒有學生資料
                 </div>
            )}

            {/* Student Rows */}
            <div className="divide-y divide-gray-100">
                {studentSummaries.map((student) => {
                    const totalScore = Array.from(student.answers.values()).reduce((a: number, b: number) => a + b, 0);
                    const answerCount = student.answers.size;
                    const totalQuestions = QUESTIONS.length;
                    const isComplete = answerCount === totalQuestions;

                    return (
                        <div key={student.user_id} className="grid grid-cols-12 gap-4 p-5 items-center hover:bg-gray-50 transition-colors">
                            {/* Avatar & Name */}
                            <div className="col-span-4 flex items-center gap-4 pl-4">
                                <div className="text-4xl">{student.avatar}</div>
                                {(student.avatar.startsWith('http') || student.avatar.startsWith('/') || student.avatar.startsWith('data:')) ? (
                                    <img 
                                        src={student.avatar} 
                                        alt={student.name} 
                                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                                    />
                                ) : (
                                    <div className="text-4xl">{student.avatar}</div>
                                )}
                                <div className="font-bold text-gray-700 text-lg">{student.name}</div>
                            </div>

                            {/* Grade / Gender */}
                            <div className="col-span-3 text-gray-600">
                                {student.grade} <span className="text-gray-300 mx-2">|</span> {student.gender}
                            </div>

                            {/* Progress */}
                            <div className="col-span-3">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${isComplete ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                   {answerCount} / {totalQuestions}
                                </span>
                            </div>

                            {/* Total Score */}
                            <div className="col-span-2 text-gray-800 font-mono text-xl">
                                {totalScore}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
