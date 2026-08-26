import { metaInsights, metaAction } from "@/lib/metaAds";
const until=new Date().toISOString().slice(0,10), since=new Date(Date.now()-30*864e5).toISOString().slice(0,10);
// account-level: video ladder + messaging + basic
try {
  const rows = await metaInsights("425581286160751", { level:"account", since, until, fields:["spend","impressions","reach","frequency","actions","video_play_actions","video_thruplay_watched_actions","video_avg_time_watched_actions","video_p25_watched_actions","video_p50_watched_actions","video_p75_watched_actions","video_p95_watched_actions","video_p100_watched_actions"] });
  const r=rows[0]??{};
  console.log("CHERY account 30d:");
  console.log("  spend", r.spend, "impr", r.impressions, "reach", r.reach, "freq", r.frequency);
  const sa=(v:any)=>Array.isArray(v)?v.reduce((s,a)=>s+Number(a.value||0),0):0;
  console.log("  video: plays", sa(r.video_play_actions), "thruplay", sa(r.video_thruplay_watched_actions), "avgTime", sa(r.video_avg_time_watched_actions));
  console.log("  ladder p25/50/75/95/100:", sa(r.video_p25_watched_actions), sa(r.video_p50_watched_actions), sa(r.video_p75_watched_actions), sa(r.video_p95_watched_actions), sa(r.video_p100_watched_actions));
  console.log("  messaging started:", metaAction(r,"onsite_conversion.messaging_conversation_started_7d","messaging_conversation_started_7d"), "| leads:", metaAction(r,"lead","onsite_conversion.lead_grouped"), "| LPV:", metaAction(r,"landing_page_view"));
  console.log("  ALL action_types:", (r.actions as any[]||[]).map(a=>a.action_type).slice(0,20).join(", "));
} catch(e){ console.log("account ERR", (e as Error).message.slice(0,160)); }
// ad-level quality ranking
try {
  const ads = await metaInsights("425581286160751", { level:"ad", since, until, fields:["ad_name","spend","quality_ranking","engagement_rate_ranking","conversion_rate_ranking"], limit:5 });
  console.log("\nAD quality rankings (top 5):");
  for(const a of ads.slice(0,5)) console.log(`  ${String(a.ad_name).slice(0,26).padEnd(26)} q:${a.quality_ranking} eng:${a.engagement_rate_ranking} conv:${a.conversion_rate_ranking}`);
} catch(e){ console.log("ad ERR", (e as Error).message.slice(0,160)); }
