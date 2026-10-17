-- 랭킹에 필요한 정보만 제공하는 안전한 조회 뷰
create or replace view public.ranking_profiles as
select id, display_name, ranking_visible, total_points, tree_count,
  case when ranking_visible = true then avatar_url else null end as avatar_url
from public.profiles;

grant select on public.ranking_profiles to anon, authenticated;
