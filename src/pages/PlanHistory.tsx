import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSavedPlans } from '@/hooks/useSavedPlans';
import { useProfile } from '@/contexts/ProfileContext';
import { BackButton } from '@/components/ui/BackButton';
import { HomeFab } from '@/components/ui/HomeButton';
import { subjectOption } from '@/config/subjects';

export default function PlanHistory() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { profiles } = useProfile();
  const { items, loading, error, hasMore, retry, loadMore } = useSavedPlans('list', search);
  return <div className="relative flex h-[100dvh] w-full max-w-md mx-auto flex-col bg-neu-bg pb-24 text-neu-text antialiased overflow-hidden">
    <header className="relative shrink-0 flex items-center justify-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-neu-bg/90">
      <div className="absolute left-6"><BackButton onClick={() => navigate(-1)} /></div>
      <h1 className="text-xl font-bold text-neu-text-secondary">复习方案</h1>
    </header>
    <main className="flex-1 min-h-0 px-6 overflow-y-auto overflow-x-hidden no-scrollbar pb-10 space-y-5">
      {items.map(item => {
        const query = new URLSearchParams({ profileId: item.profile_id, version: String(item.version) });
        const child = profiles?.find(profile => profile.profile_id === item.profile_id)?.display_name || `孩子 ${item.profile_id}`;
        return <Link key={item.plan_id} to={`/plan/${encodeURIComponent(item.plan_id)}?${query}`} className="group block rounded-2xl bg-neu-bg shadow-neu-flat p-4 active:scale-[0.98] transition-transform">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
              <h2 className="text-sm font-bold">{item.title}</h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neu-text-secondary"><span>{child}</span><span>{subjectOption(item.subject).label}</span><span>版本 {item.version}</span></div>
              <p className="text-xs text-neu-text-secondary">{item.from_date} 至 {item.through_date}</p>
              <p className="text-[10px] text-[#DC143C]">保存于 {item.created_at.replace('T', ' ').replace('Z', ' UTC')}</p>
            </div>
            <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-neu-text-secondary">visibility</span>
          </div>
        </Link>;
      })}
      {loading && <p role="status" className="text-sm text-neu-text-secondary text-center py-6">加载中...</p>}
      {error && <div className="space-y-3 text-center py-6"><p role="alert" className="text-sm text-neu-text-secondary">{error}</p>{error.startsWith('无法读取') && <button onClick={retry} className="px-4 py-2 rounded-xl shadow-neu-flat text-sm">重试</button>}</div>}
      {!loading && !error && items.length === 0 && <p className="text-sm text-neu-text-secondary text-center py-6">暂无保存的复习方案</p>}
      {!loading && !error && hasMore && <button onClick={loadMore} className="w-full rounded-xl py-3 shadow-neu-flat text-sm">加载更多</button>}
    </main>
    <HomeFab to="/" />
  </div>;
}
