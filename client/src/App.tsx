import { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Search, Bookmark, ChevronRight, ChevronDown, Menu, X, Sparkles, Video, Upload, Play, Bell, Settings,
  Flame, Clock3, Compass, BookOpen, Heart, ArrowUpRight, Star,
  SlidersHorizontal, Library, UserRound, Github, Instagram, Mail
} from "lucide-react";

type Story = {
  id: number | string; title: string; slug: string; genre: string[]; chapter: string;
  status: string; description: string; cover: string; color: string; featured?: boolean; createdAt?: string; updatedAt?: string; publishedAt?: string | null;
};

const placeholderCover = "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=80";

const genres = ["All", "Action", "Adventure", "Fantasy", "Romance", "Drama", "Comedy", "Sci-Fi", "Supernatural", "Slice of Life", "Coming of Age"];

type ApiStory = {
  id: string; slug: string; title: string; synopsis: string; coverPath: string | null; contentType?: "NOVEL" | "MANHWA" | "BOTH"; createdAt?: string; updatedAt?: string; publishedAt?: string | null;
  status: "ONGOING" | "COMPLETED" | "HIATUS";
  genres: { genre: { name: string; slug: string } }[];
  _count?: { chapters?: number };
};

const StoryCatalogContext = createContext<Story[]>([]);
function useStories() { return useContext(StoryCatalogContext); }
function normalizeApiStory(item: ApiStory, index: number): Story {
  const status = item.status === "COMPLETED" ? "Completed" : item.status === "HIATUS" ? "Hiatus" : "Ongoing";
  const palette = ["blue", "purple", "pink", "red", "green", "gold"];
  const cover = item.coverPath && /^(https?:|\/)/i.test(item.coverPath) ? item.coverPath : placeholderCover;
  return {
    id: item.id, title: item.title, slug: item.slug, genre: item.genres.map((entry) => entry.genre.name),
    chapter: `Chapter ${(item._count?.chapters ?? 0).toString().padStart(2, "0")}`, status,
    description: item.synopsis, cover, color: palette[index % palette.length], featured: index === 0, createdAt: item.createdAt, updatedAt: item.updatedAt, publishedAt: item.publishedAt,
  };
}

function StoryCatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<Story[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/stories?limit=48")
      .then((response) => { if (!response.ok) throw new Error("Story API unavailable"); return response.json(); })
      .then((result: { success: boolean; data?: ApiStory[] }) => {
        if (active && result.success && result.data) setCatalog(result.data.map(normalizeApiStory));
      })
      .catch(() => { if (active) setCatalog([]); });
    return () => { active = false; };
  }, []);
  return <StoryCatalogContext.Provider value={catalog}>{children}</StoryCatalogContext.Provider>;
}

function Header() {
  const [search, setSearch] = useState("");
  const [loggedIn, setLoggedIn] = useState(Boolean(localStorage.getItem("ns_token")));
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useEffect(() => {
    const update = () => setLoggedIn(Boolean(localStorage.getItem("ns_token")));
    window.addEventListener("ns-auth-change", update);
    return () => window.removeEventListener("ns-auth-change", update);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const token=localStorage.getItem("ns_token"); if(!token){setUnreadNotifications(0);return;} try {const r=await fetch("/api/notifications?limit=1",{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(active&&r.ok&&j.success)setUnreadNotifications(Number(j.unread)||0);}catch{ /* Keep the last known count when temporarily offline. */} };
    void refresh(); const timer=window.setInterval(refresh,30000); window.addEventListener("ns-auth-change",refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener("ns-auth-change",refresh)};
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/discover?q=${encodeURIComponent(search)}`);
    setMenuOpen(false);
  };
  return <header className="site-header">
    <div className="nav-wrap">
      <Link to="/" className="brand"><span className="brand-mark"><BookOpen size={20}/></span><span>Katha<span className="brand-accent">Verse</span><small>.com</small></span></Link>
      <nav className={menuOpen ? "nav-links open" : "nav-links"}>
        <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
        <Link to="/discover" onClick={() => setMenuOpen(false)}>Discover</Link>
        <Link to="/videos" onClick={() => setMenuOpen(false)}>Videos & Clips</Link>
        <a href="/#latest" onClick={() => setMenuOpen(false)}>Latest</a>
        <a href="/#genres" onClick={() => setMenuOpen(false)}>Genres</a>
      </nav>
      <form className="nav-search" onSubmit={submit}>
        <Search size={17}/><input aria-label="Search stories" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stories..." />
        <kbd>/</kbd>
      </form>
      <div className="nav-actions">
        <Link className="icon-btn" to="/bookmarks" aria-label="Bookmarks"><Bookmark size={19}/></Link>
        {loggedIn ? (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link to="/profile" className="login-link">My Profile</Link>
            <Link to="/messages" className="login-link">Messages</Link>
            <Link to="/notifications" className="login-link notification-nav-link">Notifications{unreadNotifications>0&&<span className="notification-badge">{unreadNotifications>99?"99+":unreadNotifications}</span>}</Link>
            <Link to="/creator" className="login-link">Creator Studio</Link>
          </div>
        ) : (
          <Link to="/login" className="login-link">Log in</Link>
        )}
        {loggedIn ? <button className="btn btn-primary btn-small" onClick={async () => { const token = localStorage.getItem("ns_token"); try { if (token) await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }); } finally { localStorage.removeItem("ns_token"); localStorage.removeItem("ns_user"); window.dispatchEvent(new Event("ns-auth-change")); window.location.href = "/"; } }}>Log out</button> : <Link to="/register" className="btn btn-primary btn-small">Join free <ArrowUpRight size={15}/></Link>}
      </div>
      <button className="mobile-menu icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X/> : <Menu/>}</button>
    </div>
  </header>;
}

function StoryCard({ story, index = 0 }: { story: Story; index?: number }) {
  return <article className="story-card" style={{ animationDelay: `${index * 55}ms` }}>
    <Link to={`/story/${story.slug}`} className="cover-wrap">
      <img src={story.cover} alt={`${story.title} cover artwork`} loading="lazy"/>
      <span className={`cover-shade ${story.color}`}></span>
      <span className="cover-label">ORIGINAL STORY</span>
      <span className="cover-chapter">{story.chapter}</span>
      <span className="cover-open"><ArrowUpRight size={17}/></span>
    </Link>
    <div className="story-info">
      <Link to={`/story/${story.slug}`} className="story-title">{story.title}</Link>
      <div className="genre-line">{story.genre.map(g => <span key={g}>{g}</span>)}</div>
      <div className="story-meta"><span className={`status-dot ${story.status.toLowerCase()}`}></span>{story.status}<span className="meta-spacer"/><BookOpen size={13}/>{story.chapter}</div>
    </div>
  </article>;
}

function SectionHeading({ eyebrow, title, action, icon }: { eyebrow: string; title: string; action?: string; icon?: React.ReactNode }) {
  return <div className="section-heading"><div><div className="eyebrow">{icon}{eyebrow}</div><h2>{title}</h2></div>{action && <Link to="/discover" className="text-link">{action}<ChevronRight size={16}/></Link>}</div>;
}

function Home() {
  const stories = useStories();
  const [activeGenre, setActiveGenre] = useState("All");
  const filtered = activeGenre === "All" ? stories : stories.filter(s => s.genre.includes(activeGenre));
  return <main>
    <section className="hero">
      <div className="hero-glow"></div><div className="hero-grid"></div>
      <div className="hero-copy">
        <div className="hero-pill"><Sparkles size={14}/> YOUR NEXT OBSESSION STARTS HERE</div>
        <h1>Stories that take<br/>you <span>somewhere</span><br/>else.</h1>
        <p>Discover worlds beyond imagination. Read original webtoons, follow your favorite creators, and find your next unforgettable story.</p>
        <div className="hero-actions"><Link to="/discover" className="btn btn-primary">Explore stories <ArrowUpRight size={17}/></Link><a href="#latest" className="btn btn-outline"><BookOpen size={17}/> Start reading</a></div>
        <div className="hero-note"><span className="note-spark">✦</span> Free to read. Made for story lovers.</div>
      </div>
      <div className="hero-art" aria-label="Featured fantasy mountain story artwork">
        <div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div>
        <div className="hero-image"><img src={stories[0]?.cover || placeholderCover} alt={stories[0] ? `Cover for ${stories[0].title}` : "Illustrative mountain landscape"}/><div className="image-vignette"></div><div className="hero-art-caption"><span className="mini-tag">{stories[0] ? "FEATURED STORY" : "YOUR NEXT CHAPTER"}</span><h3>{stories[0]?.title || <>Stories from<br/>everywhere</>}</h3><span className="caption-sub">{stories[0]?.description?.slice(0, 90) || "Discover original stories from the community."}</span></div></div>
        <div className="floating-note"><span className="float-icon"><Sparkles size={16}/></span><span><b>A world awaits</b><small>Your next favorite is here</small></span></div>
        <div className="hero-stamp"><span>KV</span><small>READ<br/>BEYOND</small></div>
      </div>
      <div className="hero-bottom"><span>01 <i>/</i> 04</span><div className="hero-progress"><span/></div><span>CURATED FOR YOU</span></div>
    </section>

    <section className="content-section trending-section" id="latest">
      <SectionHeading eyebrow="THE COMMUNITY'S PICKS" title="Stories worth staying up for" action="View all stories" icon={<Flame size={14}/>}/>
      <div className="story-grid">{stories.slice(0, 4).map((story, i) => <StoryCard key={story.id} story={story} index={i}/>)}</div>
    </section>

    <section className="genre-band" id="genres"><div className="genre-band-inner"><div><div className="eyebrow"><Compass size={14}/> FIND YOUR WORLD</div><h2>What are you <span>in the mood for?</span></h2></div><div className="genre-chips">{genres.map(g => <button key={g} className={activeGenre === g ? "genre-chip active" : "genre-chip"} onClick={() => setActiveGenre(g)}>{g}</button>)}</div></div></section>

    <section className="content-section latest-section">
      <SectionHeading eyebrow="FRESH FROM THE CANVAS" title={activeGenre === "All" ? "Find your next favorite" : `${activeGenre} stories`} action="Explore library" icon={<Clock3 size={14}/>}/>
      {filtered.length > 0 ? <div className="story-grid">{filtered.map((story, i) => <StoryCard key={story.id} story={story} index={i}/>)}</div> : <div className="empty-state"><Compass size={26}/><h3>No stories in this genre yet</h3><p>Try another genre to discover your next read.</p><button className="btn btn-outline" onClick={() => setActiveGenre("All")}>Show all stories</button></div>}
    </section>

    <section className="creator-banner"><div className="creator-icon"><Sparkles size={23}/></div><div><span className="eyebrow">YOUR WORLD. YOUR WORDS.</span><h2>Have a story to tell?</h2><p>Bring your imagination to life. Publish your original webtoon and find readers who love your world.</p></div><Link to="/register" className="btn btn-light">Become a creator <ArrowUpRight size={17}/></Link><div className="creator-decoration">✦</div></section>
  </main>;
}

function Discover() {
  const stories = useStories();
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get("q") || "");
  const [genre, setGenre] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("Latest update");
  const filtered = useMemo(() => stories.filter(s =>
    (s.title.toLowerCase().includes(query.toLowerCase()) || s.genre.join(" ").toLowerCase().includes(query.toLowerCase())) &&
    (genre === "All" || s.genre.includes(genre)) &&
    (status === "All" || s.status === status)
  ).sort((a,b) => sort === "Title A-Z" ? a.title.localeCompare(b.title) : sort === "Newest story" ? new Date(b.publishedAt || b.createdAt || 0).getTime() - new Date(a.publishedAt || a.createdAt || 0).getTime() : new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()), [query, genre, status, sort]);
  return <main className="inner-page"><div className="page-intro"><div className="eyebrow"><Compass size={14}/> THE STORY LIBRARY</div><h1>Find your next <span>world.</span></h1><p>Explore original stories, unexpected adventures, and new favorites.</p></div>
    <div className="discovery-tools"><label className="discover-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by title or genre..."/></label><label className="filter-select"><SlidersHorizontal size={15}/><select value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select><ChevronDown size={14}/></label><label className="filter-select"><select value={status} onChange={e=>setStatus(e.target.value)}>{["All","Ongoing","Completed","Hiatus"].map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={14}/></label><label className="filter-select"><select value={sort} onChange={e=>setSort(e.target.value)}>{["Latest update","Newest story","Title A-Z"].map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={14}/></label></div>
    <div className="results-line"><span>{filtered.length} stories found</span><span>Original & community stories</span></div>
    {filtered.length ? <div className="story-grid discover-grid">{filtered.map((s,i)=><StoryCard key={s.id} story={s} index={i}/>)}</div> : <div className="empty-state"><Search size={26}/><h3>No stories found</h3><p>Try another title, genre, or status.</p><button className="btn btn-outline" onClick={()=>{setQuery("");setGenre("All");setStatus("All");}}>Clear filters</button></div>}
  </main>;
}


function StoryCommunity({ storyId }: { storyId: string | number }) {
  const token = localStorage.getItem("ns_token") || "";
  const [stats, setStats] = useState<any>({ likes: 0, averageRating: 0, ratingCount: 0, comments: 0 });
  const [liked, setLiked] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [comments, setComments] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewSort, setReviewSort] = useState("recent");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token]);
  async function load() {
    const [sr, cr, lr] = await Promise.all([
      fetch(`/api/social/stories/${storyId}`),
      fetch(`/api/social/stories/${storyId}/comments?page=1&limit=20`),
      token ? fetch(`/api/social/stories/${storyId}/like`, { headers }) : Promise.resolve(null)
    ]);
    const sj = await sr.json(); if (sr.ok && sj.success) setStats(sj.data);
    const cj = await cr.json(); if (cr.ok && cj.success) setComments(cj.data || []);
    const vr = await fetch(`/api/social/stories/${storyId}/reviews?sort=${reviewSort}&page=1&limit=10`); const vj = await vr.json(); if (vr.ok && vj.success) setReviews(vj.data || []);
    if (lr) { const lj = await lr.json(); if (lr.ok) setLiked(Boolean(lj.liked)); }
    if (token) { const rr = await fetch(`/api/social/stories/${storyId}/rating`, { headers }); const rj = await rr.json(); if (rr.ok) setMyRating(Number(rj.score || 0)); }
  }
  useEffect(() => { let alive = true; (async () => { try { await load(); } catch { if (alive) setError("Community details could not be loaded."); } })(); return () => { alive = false; }; }, [storyId, token, reviewSort]);
  async function toggleLike() {
    if (!token) { setError("Log in to like this story."); return; }
    const old = liked; setLiked(!old); setStats((x:any)=>({...x, likes: Math.max(0, x.likes + (old ? -1 : 1))})); setError("");
    try { const r = await fetch(`/api/social/stories/${storyId}/like`, { method: "POST", headers }); const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.message || "Like failed."); setLiked(Boolean(j.liked)); setStats((x:any)=>({...x, likes: j.likes})); }
    catch (e:any) { setLiked(old); setStats((x:any)=>({...x, likes: Math.max(0, x.likes + (old ? 1 : -1))})); setError(e.message || "Like failed."); }
  }
  async function rate(score:number) {
    if (!token) { setError("Log in to rate this story."); return; }
    setBusy(true); setError("");
    try { const r=await fetch(`/api/social/stories/${storyId}/rating`, {method:"PUT",headers,body:JSON.stringify({score})}); const j=await r.json(); if(!r.ok||!j.success) throw new Error(j.message||"Rating failed."); setMyRating(score); setStats((x:any)=>({...x,averageRating:j.averageRating,ratingCount:j.ratingCount})); }
    catch(e:any) { setError(e.message||"Rating failed."); } finally { setBusy(false); }
  }
  async function postComment(parentId:string|null, body:string) {
    if (!token) { setError("Log in to comment."); return; }
    if (!body.trim()) return;
    setBusy(true); setError("");
    try { const r=await fetch(`/api/social/stories/${storyId}/comments`,{method:"POST",headers,body:JSON.stringify({body,parentId})}); const j=await r.json(); if(!r.ok||!j.success) throw new Error(j.message||"Comment failed."); await load(); setDraft("");setReplyDraft("");setReplyTo(null); }
    catch(e:any) { setError(e.message||"Comment failed."); } finally { setBusy(false); }
  }
  async function submitReview(e: React.FormEvent) {
    e.preventDefault(); if (!token) { setError("Log in to write a review."); return; }
    setBusy(true); setError("");
    try { const r=await fetch(`/api/social/stories/${storyId}/reviews`,{method:"POST",headers,body:JSON.stringify({body:reviewDraft})}); const j=await r.json(); if(!r.ok||!j.success)throw new Error(j.message||"Review could not be saved."); setReviewDraft(""); await load(); }
    catch(e:any) { setError(e.message||"Review could not be saved."); } finally { setBusy(false); }
  }
  async function deleteReview(id:string) {
    if (!token || !window.confirm("Delete your written review?")) return;
    try { const r=await fetch(`/api/social/reviews/${id}`,{method:"DELETE",headers}); const j=await r.json(); if(!r.ok||!j.success)throw new Error(j.message||"Review could not be deleted."); await load(); }
    catch(e:any) { setError(e.message||"Review could not be deleted."); }
  }
  async function helpfulReview(id:string) {
    if (!token) { setError("Log in to mark reviews helpful."); return; }
    try { const r=await fetch(`/api/social/reviews/${id}/helpful`,{method:"POST",headers}); const j=await r.json(); if(!r.ok||!j.success)throw new Error(j.message||"Could not update helpful vote."); setReviews(old=>old.map(v=>v.id===id?{...v,_count:{...v._count,helpfulVotes:j.count}}:v)); }
    catch(e:any) { setError(e.message||"Could not update helpful vote."); }
  }
  async function reportReview(id:string) {
    if (!token) { setError("Log in to report a review."); return; }
    const reason=window.prompt("Why are you reporting this review? (At least 5 characters)"); if(!reason)return;
    try { const r=await fetch(`/api/social/reviews/${id}/report`,{method:"POST",headers,body:JSON.stringify({reason})}); const j=await r.json(); if(!r.ok||!j.success)throw new Error(j.message||"Could not report review."); setError("Review report submitted to moderation."); }
    catch(e:any) { setError(e.message||"Could not report review."); }
  }
  async function editComment(id:string, current:string) {
    if (!token) return; const body=window.prompt("Edit your comment",current); if(body===null||!body.trim())return;
    try { const r=await fetch(`/api/social/comments/${id}`,{method:"PATCH",headers,body:JSON.stringify({body})}); const j=await r.json(); if(!r.ok||!j.success)throw new Error(j.message||"Comment could not be updated."); await load(); }
    catch(e:any) { setError(e.message||"Comment could not be updated."); }
  }
  async function reportComment(id:string) {
    if (!token) { setError("Log in to report comments."); return; } const reason=window.prompt("Why are you reporting this comment? (At least 5 characters)"); if(!reason)return;
    try { const r=await fetch(`/api/social/comments/${id}/report`,{method:"POST",headers,body:JSON.stringify({reason})}); const j=await r.json(); if(!r.ok||!j.success)throw new Error(j.message||"Could not report comment."); setError("Comment report submitted to moderation."); }
    catch(e:any) { setError(e.message||"Could not report comment."); }
  }
  async function removeComment(id:string) {
    if (!token || !window.confirm("Delete this comment and its replies?")) return;
    try { const r=await fetch(`/api/social/comments/${id}`,{method:"DELETE",headers}); const j=await r.json(); if(!r.ok||!j.success) throw new Error(j.message||"Delete failed."); await load(); }
    catch(e:any) { setError(e.message||"Delete failed."); }
  }
  const me = (()=>{try{return JSON.parse(localStorage.getItem("ns_user")||"null")}catch{return null}})();
  return <section className="community-panel">
    <div className="community-heading"><div><span className="eyebrow">READERS' CORNER</span><h2>Join the conversation</h2></div><div className="community-rating"><Star size={17}/><b>{Number(stats.averageRating||0).toFixed(1)}</b><span>({stats.ratingCount||0} ratings)</span></div></div>
    <div className="community-actions"><button className={liked?"btn btn-primary":"btn btn-outline"} onClick={toggleLike}><Heart size={17} fill={liked?"currentColor":"none"}/>{liked?"Liked":"Like"} · {stats.likes||0}</button><div className="star-picker" aria-label="Rate this story"><span>Your rating:</span>{[1,2,3,4,5].map(n=><button key={n} disabled={busy} aria-label={`${n} stars`} className={n<=myRating?"star selected":"star"} onClick={()=>rate(n)}>★</button>)}{myRating>0&&<small>{myRating}/5</small>}</div></div>
    {error&&<p className="community-error" role="alert">{error}</p>}
    <section className="written-reviews"><div className="community-heading"><div><h3>Written reviews</h3><p className="community-muted">Reviews are separate from star ratings.</p></div><select aria-label="Sort reviews" value={reviewSort} onChange={e=>setReviewSort(e.target.value)}><option value="recent">Most recent</option><option value="helpful">Most helpful</option></select></div>
      <form className="comment-compose" onSubmit={submitReview}><label htmlFor={`review-${storyId}`}>Write or update your review</label><textarea id={`review-${storyId}`} value={reviewDraft} maxLength={3000} minLength={10} onChange={e=>setReviewDraft(e.target.value)} placeholder="Tell other readers what worked for you (at least 10 characters)..." rows={3}/><div className="comment-compose-footer"><small>{reviewDraft.length}/3000</small><button className="btn btn-primary btn-small" disabled={busy||reviewDraft.trim().length<10}>Publish review</button></div></form>
      {reviews.length===0?<p className="community-muted">No written reviews yet.</p>:reviews.map((v:any)=><article className="review-card" key={v.id}><div className="comment-author"><b>{v.user?.displayName||v.user?.username||"Reader"}</b><time>{new Date(v.updatedAt||v.createdAt).toLocaleString()}</time></div><p>{v.body}</p><div className="comment-controls"><button type="button" onClick={()=>void helpfulReview(v.id)}>Helpful · {v._count?.helpfulVotes||0}</button><button type="button" onClick={()=>void reportReview(v.id)}>Report</button>{me?.id===v.userId&&<button type="button" onClick={()=>void deleteReview(v.id)}>Delete</button>}</div></article>)}
    </section>
    <form className="comment-compose" onSubmit={e=>{e.preventDefault();void postComment(null,draft)}}><label htmlFor={`comment-${storyId}`}>Add a comment</label><textarea id={`comment-${storyId}`} value={draft} maxLength={3000} onChange={e=>setDraft(e.target.value)} placeholder="Share what you think about this story..." rows={3}/><div className="comment-compose-footer"><small>{draft.length}/3000</small><button className="btn btn-primary btn-small" disabled={busy||!draft.trim()}>Post comment</button></div></form>
    <div className="comment-list"><div className="comment-list-title"><h3>Comments</h3><span>{stats.comments||0}</span></div>{comments.length===0?<p className="community-muted">No comments yet. Start the discussion.</p>:comments.map((c:any)=><article className="comment-card" key={c.id}><div className="comment-author"><b>{c.user?.displayName||c.user?.username||"Reader"}</b><time>{new Date(c.createdAt).toLocaleString()}</time></div><p>{c.body}</p><div className="comment-controls"><button type="button" onClick={()=>{setReplyTo(replyTo===c.id?null:c.id);setReplyDraft("")}}>Reply</button>{me?.id===c.userId&&<><button type="button" onClick={()=>void editComment(c.id,c.body)}>Edit</button><button type="button" onClick={()=>void removeComment(c.id)}>Delete</button></>}<button type="button" onClick={()=>void reportComment(c.id)}>Report</button></div>{replyTo===c.id&&<form className="reply-compose" onSubmit={e=>{e.preventDefault();void postComment(c.id,replyDraft)}}><textarea value={replyDraft} maxLength={3000} onChange={e=>setReplyDraft(e.target.value)} placeholder={`Reply to ${c.user?.username||"reader"}...`} rows={2}/><button className="btn btn-primary btn-small" disabled={busy||!replyDraft.trim()}>Reply</button></form>}{(c.replies||[]).map((r:any)=><div className="comment-reply" key={r.id}><div className="comment-author"><b>{r.user?.displayName||r.user?.username||"Reader"}</b><time>{new Date(r.createdAt).toLocaleString()}</time></div><p>{r.body}</p>{me?.id===r.userId&&<button className="comment-delete" onClick={()=>void removeComment(r.id)}>Delete</button>}</div>)}</article>)}</div>
  </section>;
}

function CreatorProfile() {
  const { creatorId } = useParams(); const [creator,setCreator]=useState<any>(null); const [following,setFollowing]=useState(false); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const token=localStorage.getItem("ns_token")||"";
  async function load(){const r=await fetch(`/api/creators/${creatorId}`);const j=await r.json();if(!r.ok||!j.success)throw new Error(j.message||"Creator profile could not be loaded.");setCreator(j.data);if(token){const fr=await fetch(`/api/social/creators/${creatorId}/following`,{headers:{Authorization:`Bearer ${token}`}});const fj=await fr.json();if(fr.ok)setFollowing(Boolean(fj.following));}}
  useEffect(()=>{load().catch(e=>setError(e.message));},[creatorId,token]);
  async function toggleFollow(){if(!token){setError("Log in to follow creators.");return;}setBusy(true);const old=following;setFollowing(!old);setCreator((c:any)=>c?({...c,followers:Math.max(0,c.followers+(old?-1:1))}):c);try{const r=await fetch(`/api/social/creators/${creatorId}/follow`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.message||"Could not update follow.");setFollowing(Boolean(j.following));setCreator((c:any)=>({...c,followers:j.followers}));}catch(e){setFollowing(old);setCreator((c:any)=>c?({...c,followers:Math.max(0,c.followers+(old?1:-1))}):c);setError(e instanceof Error?e.message:"Could not update follow.");}finally{setBusy(false);}}
  if(error&&!creator)return <main className="inner-page"><p className="community-error">{error}</p><Link to="/discover" className="btn btn-primary">Back to discover</Link></main>;
  if(!creator)return <main className="inner-page"><p className="reader-loading">Loading creator profile...</p></main>;
  const stories:Story[]=(creator.stories||[]).map((item:any,i:number)=>normalizeApiStory(item,i));
  return <main className="inner-page creator-profile"><Link to="/discover" className="back-link">‹ Discover</Link><section className="creator-profile-hero workspace-card"><div className="creator-avatar">{creator.avatarPath?<img src={creator.avatarPath} alt=""/>:(creator.displayName||creator.username).slice(0,1).toUpperCase()}</div><div className="creator-profile-copy"><div className="eyebrow">CREATOR PROFILE</div><h1>{creator.displayName||creator.username}</h1><p>@{creator.username}</p><p>{creator.bio||"A creator sharing original stories with the KathaVerse community."}</p><div className="creator-profile-stats"><span><b>{creator.followers}</b> followers</span><span><b>{creator.likes}</b> profile likes</span><span><b>{creator.averageRating.toFixed(2)} ★</b> story rating</span></div>{[{label:"Website",url:creator.websiteUrl},{label:"Instagram",url:creator.instagramUrl},{label:"Facebook",url:creator.facebookUrl},{label:"YouTube",url:creator.youtubeUrl},{label:"TikTok",url:creator.tiktokUrl},{label:"GitHub",url:creator.githubUrl},{label:"LinkedIn",url:creator.linkedinUrl}].some(link=>link.url)&&<nav className="creator-social-links" aria-label="Creator social accounts">{[{label:"Website",url:creator.websiteUrl},{label:"Instagram",url:creator.instagramUrl},{label:"Facebook",url:creator.facebookUrl},{label:"YouTube",url:creator.youtubeUrl},{label:"TikTok",url:creator.tiktokUrl},{label:"GitHub",url:creator.githubUrl},{label:"LinkedIn",url:creator.linkedinUrl}].filter(link=>link.url).map(link=><a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</nav>}<div className="detail-actions"><button className="btn btn-primary" disabled={busy} onClick={toggleFollow}>{following?"Following":"Follow creator"}</button>{token&&<Link className="btn btn-outline" to={`/messages?recipient=${encodeURIComponent(creator.id)}`}>Message creator</Link>}</div></div></section>{error&&<p className="community-error">{error}</p>}<div className="section-heading"><div><div className="eyebrow">PUBLISHED WORK</div><h2>Stories by {creator.displayName||creator.username}</h2></div></div>{stories.length?<div className="story-grid">{stories.map((story,i)=><StoryCard key={story.id} story={story} index={i}/>)}</div>:<div className="empty-state"><BookOpen/><h3>No published stories yet</h3></div>}</main>;
}

function StoryDetails() {
  const stories = useStories(); const { slug } = useParams(); const story = stories.find(s => s.slug === slug);
  const [saved, setSaved] = useState(false); const [detail, setDetail] = useState<any>(null); const [detailError, setDetailError] = useState("");
  useEffect(() => { let active=true; setDetail(null); fetch(`/api/stories/${slug}`).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!ok||!j.success)throw new Error(j.message||"Story details unavailable");if(active){setDetail(j.data); const token=localStorage.getItem("ns_token"); if(token) fetch(`/api/bookmarks/${j.data.id}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).then(b=>{if(active&&b.success)setSaved(Boolean(b.saved))}).catch(()=>undefined)}}).catch(e=>{if(active)setDetailError(e.message)});return()=>{active=false}},[slug]);
  async function toggleBookmark(){const token=localStorage.getItem("ns_token");if(!token){setDetailError("Log in to save this story to your library.");return;}if(!detail?.id)return;const old=saved;setSaved(!old);try{const r=await fetch(`/api/bookmarks/${detail.id}`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.message||"Could not update your library.");setSaved(Boolean(j.saved));}catch(e){setSaved(old);setDetailError(e instanceof Error?e.message:"Could not update your library.")}}
  if (!story) return <NotFound/>;
  const chapters = detail?.chapters || [];
  return <main className="inner-page detail-page"><Link to="/discover" className="back-link">‹ Back to discover</Link><div className="detail-layout"><div className="detail-cover"><img src={story.cover} alt={story.title}/></div><div className="detail-copy"><div className="eyebrow"><Sparkles size={14}/> KathaVerse ORIGINAL</div><h1>{story.title}</h1><div className="detail-tags">{story.genre.map(g=><span key={g}>{g}</span>)}<span>{story.status}</span>{detail?.contentType&&<span>{detail.contentType}</span>}</div><p className="detail-description">{story.description}</p><div className="detail-facts"><div><small>STATUS</small><b>{story.status}</b></div><div><small>CHAPTERS</small><b>{detail?chapters.length:"..."} available</b></div><div><small>READING</small><b>Free</b></div></div><div className="detail-actions">{chapters.length>0?<Link to={`/read/${story.slug}/${chapters[0].number}`} className="btn btn-primary"><BookOpen size={17}/> Start reading <ArrowUpRight size={16}/></Link>:<span className="btn btn-outline">No published chapters yet</span>}<button className={saved ? "btn btn-outline saved" : "btn btn-outline"} onClick={toggleBookmark}><Bookmark size={17}/>{saved ? "Saved to library" : "Add to library"}</button>{detail?.creator?.id && localStorage.getItem("ns_token") && <Link className="btn btn-outline" to={`/messages?recipient=${encodeURIComponent(detail.creator.id)}`}>Message creator</Link>}</div>{detail?.creator && <p className="community-muted">Created by <Link to={`/creators/${detail.creator.id}`} className="text-link">{detail.creator.displayName || detail.creator.username}</Link></p>}{detailError&&<p className="demo-note">{detailError}</p>}</div></div><div className="chapter-section"><SectionHeading eyebrow="THE JOURNEY BEGINS" title="Chapters"/>{chapters.length?chapters.map((c:any)=><div className="chapter-row" key={c.id}><span className="chapter-number">{String(c.number).padStart(2,"0")}</span><span><b>{c.title}</b><small>{c.publishedAt?new Date(c.publishedAt).toLocaleDateString():"Published chapter"}</small></span><span className="chapter-free">FREE</span><Link to={`/read/${story.slug}/${c.number}`} className="chapter-go"><ChevronRight/></Link></div>):<p>{detailError?"Could not load the chapter list.":detail?"No published chapters yet. The creator can add text or manhwa pages in Creator Studio.":"Loading chapters..."}</p>}</div><StoryCommunity storyId={detail?.id || story.id}/></main>;
}

function Reader() {
  const stories = useStories(); const { slug, chapter } = useParams(); const story = stories.find(s => s.slug === slug);
  const [width, setWidth] = useState("comfortable"); const [background, setBackground] = useState("dark");
  const [chapterData, setChapterData] = useState<any>(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; setChapterData(null); setError("");
    fetch(`/api/stories/${slug}`).then(r => { if (!r.ok) throw new Error("Story details could not be loaded."); return r.json(); }).then(async (result) => {
      const found = result.data?.chapters?.find((item: any) => Number(item.number) === Number(chapter));
      if (!found) throw new Error("This chapter has not been published yet. Ask the creator to add chapter content.");
      const response = await fetch(`/api/chapters/${found.id}`); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Chapter could not be loaded."); if (active) setChapterData(data.data);
    }).catch((e) => { if (active) setError(e.message || "Could not load chapter."); });
    return () => { active = false; };
  }, [slug, chapter]);
  useEffect(() => {
    const token=localStorage.getItem("ns_token"); if(!token||!chapterData?.id)return;
    let alive=true; let restored=false;
    const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
    fetch(`/api/reading-progress/${chapterData.id}`,{headers}).then(r=>r.json()).then(j=>{
      if(!alive||!j.success||!j.data||restored)return; restored=true;
      const percent=Number(j.data.scrollPercentage)||0;
      if(percent>0)setTimeout(()=>{if(alive){const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);window.scrollTo({top:max*percent/100,behavior:"auto"});}},150);
    }).catch(()=>undefined);
    const save=()=>{const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);const percent=Math.max(0,Math.min(100,window.scrollY/max*100));fetch(`/api/reading-progress/${chapterData.id}`,{method:"PUT",headers,body:JSON.stringify({scrollPercentage:Math.round(percent*100)/100,lastPanelPosition:0})}).catch(()=>undefined);};
    const timer=window.setInterval(save,5000); window.addEventListener("pagehide",save);
    return()=>{alive=false;window.clearInterval(timer);window.removeEventListener("pagehide",save);};
  },[chapterData?.id]);
  if (!story) return <NotFound/>;
  return <main className={`reader-page reader-${background}`}><div className="reader-toolbar"><Link to={`/story/${story.slug}`} className="back-link">‹ {story.title}</Link><span>{chapterData ? `Chapter ${chapterData.number} · ${chapterData.title}` : `Chapter ${chapter}`}</span><div className="reader-controls"><select aria-label="Reader width" value={width} onChange={e=>setWidth(e.target.value)}><option value="narrow">Narrow</option><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select><select aria-label="Reader background" value={background} onChange={e=>setBackground(e.target.value)}><option value="dark">Dark</option><option value="black">Black</option><option value="paper">Paper</option></select></div></div><div className={`reader-content width-${width}`}><div className="reader-title"><span className="eyebrow">KathaVerse ORIGINAL</span><h1>{story.title}</h1><p>{chapterData ? `Chapter ${chapterData.number} — ${chapterData.title}` : `Chapter ${chapter}`}</p></div>
    {error ? <div className="empty-state"><BookOpen size={26}/><h3>Chapter not available</h3><p>{error}</p><Link to={`/story/${story.slug}`} className="btn btn-primary">Back to story</Link></div> : !chapterData ? <p className="reader-loading">Loading chapter...</p> : <>
      {chapterData.content && <article className="novel-content">{chapterData.content.split(/\n{2,}/).map((paragraph: string, i: number) => <p key={i}>{paragraph}</p>)}</article>}
      {chapterData.panels?.length > 0 && <div className="manhwa-panels">{chapterData.panels.map((panel: any) => <img key={panel.id} src={panel.imagePath} alt={`Manhwa page ${panel.position}`} loading="lazy"/>)}</div>}
      {!chapterData.content && !chapterData.panels?.length && <div className="empty-state"><h3>This chapter has no content yet</h3><p>The creator needs to add text or upload manhwa pages.</p></div>}
      <div className="reader-end"><p>You've reached the end of this chapter.</p><Link to={`/story/${story.slug}`} className="btn btn-primary">Back to story <ChevronRight size={16}/></Link></div>
    </>}</div></main>;
}

function Bookmarks() {
  const [items, setItems] = useState<any[]>([]); const [error, setError] = useState(""); const token = localStorage.getItem("ns_token") || "";
  useEffect(() => { if(!token)return; fetch("/api/bookmarks",{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.message||"Could not load your library.");setItems(j.data||[])}).catch(e=>setError(e.message)); },[]);
  async function remove(storyId:string){try{const r=await fetch(`/api/bookmarks/${storyId}`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok)throw new Error(j.message||"Could not remove bookmark.");setItems(old=>old.filter(x=>x.storyId!==storyId));}catch(e){setError(e instanceof Error?e.message:"Could not remove bookmark.")}}
  if(!token)return <main className="inner-page"><div className="page-intro"><div className="eyebrow"><Library size={14}/> YOUR LIBRARY</div><h1>Your <span>bookmarks.</span></h1><p>Log in to keep your favorite stories synced to your account.</p></div><div className="empty-state"><Bookmark size={27}/><Link to="/login" className="btn btn-primary">Log in</Link></div></main>;
  return <main className="inner-page"><div className="page-intro"><div className="eyebrow"><Library size={14}/> YOUR LIBRARY</div><h1>Your <span>bookmarks.</span></h1><p>Your saved stories, available across sessions and devices.</p></div>{error&&<p className="community-error">{error}</p>}{items.length?<div className="story-grid">{items.map((item:any,i:number)=>{const story=normalizeApiStory({id:item.story.id,slug:item.story.slug,title:item.story.title,synopsis:item.story.synopsis,coverPath:item.story.coverPath,contentType:item.story.contentType,status:item.story.status,genres:item.story.genres||[]},i);return <article key={item.id} className="story-card"><StoryCard story={story}/><button className="video-delete" onClick={()=>remove(item.storyId)}>Remove from library</button></article>})}</div>:<div className="empty-state"><Bookmark size={27}/><h3>Your library starts here</h3><p>Bookmark stories as you explore and they'll appear here.</p><Link to="/discover" className="btn btn-primary">Discover stories <ArrowUpRight size={16}/></Link></div>}</main>;
}

function AuthPage({ register = false }: { register?: boolean }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  return <main className="auth-page"><div className="auth-glow"></div><div className="auth-card"><Link to="/" className="brand auth-brand"><span className="brand-mark"><BookOpen size={20}/></span><span>Katha<span className="brand-accent">Verse</span><small>.com</small></span></Link><div className="eyebrow">{register ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</div><h1>{register ? "Join the story." : "Good to see you."}</h1><p>{register ? "Create an account and publish your original stories immediately." : "Sign in to return to your reading world."}</p><form className="auth-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");const form=new FormData(e.currentTarget as HTMLFormElement);const body=register?{username:String(form.get("username")),email:String(form.get("email")),password:String(form.get("password")),displayName:String(form.get("displayName")||""),role:String(form.get("role")||"USER")}:{login:String(form.get("login")),password:String(form.get("password"))};try{const response=await fetch(`/api/auth/${register?"register":"login"}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message||"Could not sign in.");localStorage.setItem("ns_token",result.token);localStorage.setItem("ns_user",JSON.stringify(result.user));window.dispatchEvent(new Event("ns-auth-change"));navigate(result.user.role==="ADMIN"?"/admin":"/creator");}catch(err){setMessage(err instanceof Error?err.message:"Could not connect to the API.");}finally{setBusy(false);}}}>{register && <><label>Username<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" placeholder="Your username"/></label><label>Display name<input name="displayName" maxLength={80} placeholder="How readers see you"/></label><label>Account type<select name="role" defaultValue="USER"><option value="USER">Reader — read and bookmark</option><option value="CREATOR">Creator — publish novels and manhwa</option></select></label></>}<label>{register?"Email address":"Username or email"}<input name={register?"email":"login"} type={register?"email":"text"} required placeholder={register?"you@example.com":"you@example.com or username"}/></label><label>Password<input name="password" type="password" required minLength={register?10:1} maxLength={128} placeholder={register?"At least 10 characters":"Your password"}/></label>{message&&<div className="form-notice">{message}</div>}<button className="btn btn-primary auth-submit" disabled={busy} type="submit">{busy?"Please wait...":register?"Create account":"Log in"} <ArrowUpRight size={16}/></button></form><div className="auth-switch">{register ? "Already part of the story?" : "New to KathaVerse?"} <Link to={register ? "/login" : "/register"}>{register ? "Log in" : "Create an account"}</Link></div><Link to="/" className="back-home">← Back to home</Link></div></main>;
}

function CreatorStudio() {
  const [user,setUser]=useState<any>(()=>{try{return JSON.parse(localStorage.getItem("ns_user")||"null")}catch{return null}}); const [stories,setStories]=useState<any[]>([]); const [message,setMessage]=useState(""); const [selected,setSelected]=useState(""); const [busy,setBusy]=useState(false);
  const [title,setTitle]=useState("");const [synopsis,setSynopsis]=useState("");const [contentType,setContentType]=useState("BOTH");const [genresText,setGenresText]=useState("Fantasy, Adventure");
  const [chapterTitle,setChapterTitle]=useState("Chapter 1");const [chapterContent,setChapterContent]=useState("");const [panels,setPanels]=useState<File[]>([]);
  const token=localStorage.getItem("ns_token")||""; const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  const refresh=async()=>{const r=await fetch("/api/creator/stories",{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok)throw new Error(j.message||"Please log in again.");setStories(j.data||[]);};
  useEffect(()=>{if(!token){setMessage("Please log in or create a creator account first.");return;}fetch("/api/auth/me",{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).then(j=>{if(!j.success)throw new Error(j.message);setUser(j.user);return refresh();}).catch(e=>setMessage(e.message));},[]);
  const asDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read image file"));reader.readAsDataURL(file)});
  const createStory=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setMessage("");try{let coverData="";const cover=(document.getElementById("story-cover") as HTMLInputElement)?.files?.[0];if(cover)coverData=await asDataUrl(cover);const r=await fetch("/api/creator/stories",{method:"POST",headers,body:JSON.stringify({title,synopsis,contentType,genres:genresText.split(",").map(s=>s.trim()).filter(Boolean),coverData:coverData||undefined})});const j=await r.json();if(!r.ok)throw new Error(j.message);await refresh();setSelected(j.data.id);setTitle("");setSynopsis("");setMessage("Story published successfully. You can now add its first chapter.");}catch(e){setMessage(e instanceof Error?e.message:"Could not publish story.")}finally{setBusy(false)}};
  const publishChapter=async(e:React.FormEvent)=>{e.preventDefault();if(!selected){setMessage("Choose a story first.");return;}setBusy(true);setMessage("");try{const encoded=await Promise.all(panels.map(async file=>({data:await asDataUrl(file)})));const r=await fetch(`/api/creator/stories/${selected}/chapters`,{method:"POST",headers,body:JSON.stringify({title:chapterTitle,content:chapterContent,panels:encoded})});const j=await r.json();if(!r.ok)throw new Error(j.message);setChapterTitle("");setChapterContent("");setPanels([]);await refresh();setMessage("Chapter published successfully.");}catch(e){setMessage(e instanceof Error?e.message:"Could not publish chapter.")}finally{setBusy(false)}};
  return <main className="inner-page creator-workspace"><div className="page-intro"><div className="eyebrow"><Sparkles size={14}/> CREATOR STUDIO</div><h1>Your stories, <span>your world.</span></h1><p>Publish text novels, manhwa pages, or a mix of both. New stories publish immediately.</p></div>{message&&<div className="form-notice workspace-notice">{message}</div>}{!token?<Link to="/login" className="btn btn-primary">Log in to Creator Studio</Link>:<><div className="workspace-grid"><section className="workspace-card"><h2>Create a story</h2><form className="auth-form" onSubmit={createStory}><label>Story title<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={160}/></label><label>Synopsis<textarea value={synopsis} onChange={e=>setSynopsis(e.target.value)} required minLength={10} maxLength={5000} rows={4}/></label><label>Format<select value={contentType} onChange={e=>setContentType(e.target.value)}><option value="NOVEL">Text novel</option><option value="MANHWA">Manhwa (images)</option><option value="BOTH">Novel + manhwa</option></select></label><label>Genres (comma separated)<input value={genresText} onChange={e=>setGenresText(e.target.value)}/></label><label>Cover image (optional)<input id="story-cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/></label><button className="btn btn-primary" disabled={busy}>{busy?"Publishing...":"Publish story"}</button></form></section><section className="workspace-card"><h2>Publish a chapter</h2><form className="auth-form" onSubmit={publishChapter}><label>Story<select value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">Choose your story</option>{stories.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>Chapter title<input value={chapterTitle} onChange={e=>setChapterTitle(e.target.value)} required/></label><label>Novel text<textarea value={chapterContent} onChange={e=>setChapterContent(e.target.value)} rows={8} placeholder="Write your chapter here. Leave blank if this is an image-only manhwa chapter."/></label><label>Manhwa pages (select multiple; max 8 MB each)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={e=>setPanels(Array.from(e.target.files||[]))}/><small>{panels.length} page(s) selected. Keep each image under 8 MB.</small></label><button className="btn btn-primary" disabled={busy||(!chapterContent.trim()&&!panels.length)}>{busy?"Publishing...":"Publish chapter"}</button></form></section></div><section className="workspace-card story-management"><h2>Your published stories</h2>{stories.length?stories.map(s=><div className="manage-story" key={s.id}><div><b>{s.title}</b><small>{s.chapters?.length||0} chapter(s) · {s.contentType}</small></div><Link to={`/story/${s.slug}`} className="text-link">View story <ChevronRight size={15}/></Link></div>):<p>No stories yet. Create your first one above.</p>}</section>{user?.role==="ADMIN"&&<Link to="/admin" className="btn btn-outline">Open admin dashboard</Link>}</>}</main>;
}

function UserProfile() {
  const [user, setUser] = useState<any>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [activity, setActivity] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const token = localStorage.getItem("ns_token") || "";
  const profileHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const fileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read the selected image.")); reader.readAsDataURL(file); });
  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setProfileBusy(true); setMessage("");
    try {
      const form = new FormData(e.currentTarget);
      const body: Record<string, string> = {};
      ["displayName", "bio", "websiteUrl", "instagramUrl", "facebookUrl", "youtubeUrl", "tiktokUrl", "githubUrl", "linkedinUrl"].forEach(key => body[key] = String(form.get(key) || "").trim());
      if (avatarFile) body.avatarData = await fileAsDataUrl(avatarFile);
      const response = await fetch("/api/me/profile", { method: "PATCH", headers: profileHeaders, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || "Could not update profile.");
      setUser(result.user); localStorage.setItem("ns_user", JSON.stringify(result.user)); setAvatarFile(null); setMessage("Profile saved successfully.");
      window.dispatchEvent(new Event("ns-profile-change"));
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not update profile."); }
    finally { setProfileBusy(false); }
  };

  useEffect(() => {
    if (!token) {
      setMessage("Please log in to view your profile.");
      return;
    }
    
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) setUser(j.user); else throw new Error(j.message); })
      .catch(() => setMessage("Could not load profile."));

    fetch("/api/creator/stories", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => { if (j.success) setStories(j.data || []); })
      .catch(() => undefined);
    fetch("/api/me/activity", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(j => { if (j.success) setActivity(j.data); }).catch(() => undefined);
    fetch("/api/creator/analytics", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(j => { if (j.success) setAnalytics(j.data); }).catch(() => undefined);
  }, [token]);

  if (!token) return <main className="inner-page"><div className="empty-state"><UserRound size={26}/><h3>Not Logged In</h3><p>Please log in to view your dashboard.</p><Link to="/login" className="btn btn-primary">Go to Login</Link></div></main>;

  return (
    <main className="inner-page">
      <div className="page-intro">
        <div className="eyebrow"><UserRound size={14} /> YOUR DASHBOARD</div>
        <h1>Welcome back, <span>{user?.displayName || user?.username || "Creator"}.</span></h1>
        <p>Manage your profile and view your published stories.</p>
      </div>

      {message && <div className="form-notice workspace-notice">{message}</div>}

      <div className="admin-stats">
        <section className="workspace-card"><small>LIKED ITEMS</small><h2>{activity?.likes?.length ?? "—"}</h2></section>
        <section className="workspace-card"><small>MY RATINGS</small><h2>{activity?.ratings?.length ?? "—"}</h2></section>
        <section className="workspace-card"><small>FOLLOWING</small><h2>{activity?.follows?.length ?? "—"}</h2></section>
        <section className="workspace-card"><small>SAVED SERIES</small><h2>{activity?.bookmarks?.length ?? "—"}</h2></section>
        <section className="workspace-card"><small>UNREAD NOTIFICATIONS</small><h2>{activity?.unreadNotifications ?? "—"}</h2><Link to="/notifications" className="text-link">View notifications <ChevronRight size={14}/></Link></section>
        <section className="workspace-card"><small>PRIVATE MESSAGES</small><h2><Link to="/messages" className="text-link">Open inbox <ChevronRight size={14}/></Link></h2></section>
      </div>
      {activity && <div className="workspace-grid">
        <section className="workspace-card"><h2>My ratings</h2>{activity.ratings.length ? activity.ratings.slice(0,6).map((r:any)=><div className="manage-story" key={r.id}><div><b>{r.story?.title || "Story"}</b><small>{"★".repeat(r.score)} · Updated {new Date(r.updatedAt).toLocaleDateString()}</small></div><Link to={`/story/${r.story?.slug}`} className="text-link">View <ChevronRight size={14}/></Link></div>) : <p>No ratings yet.</p>}</section>
        <section className="workspace-card"><h2>My saved series</h2>{activity.bookmarks.length ? activity.bookmarks.slice(0,6).map((b:any)=><div className="manage-story" key={b.id}><div><b>{b.story?.title || "Story"}</b><small>Saved {new Date(b.createdAt).toLocaleDateString()}</small></div><Link to={`/story/${b.story?.slug}`} className="text-link">Read <ChevronRight size={14}/></Link></div>) : <p>Your saved stories will appear here.</p>}</section>
        <section className="workspace-card"><h2>Continue reading</h2>{activity.readingProgress?.length ? activity.readingProgress.slice(0,6).map((p:any)=><div className="manage-story" key={p.id}><div><b>{p.chapter?.story?.title || "Story"} — {p.chapter?.title}</b><small>{Math.round(p.scrollPercentage)}% complete · Updated {new Date(p.updatedAt).toLocaleDateString()}</small></div><Link to={`/read/${p.chapter?.story?.slug}/${p.chapter?.number}`} className="text-link">Resume <ChevronRight size={14}/></Link></div>) : <p>Your reading progress will appear here after you start a chapter while logged in.</p>}</section>
      </div>}
      {analytics && ["CREATOR","ADMIN"].includes(user?.role) && <section className="workspace-card"><div className="eyebrow">CREATOR INSIGHTS</div><h2>Engagement overview</h2><div className="admin-stats"><div><small>Total likes</small><h2>{analytics.totalLikes}</h2></div><div><small>Average rating</small><h2>{analytics.averageRating.toFixed(2)} ★</h2></div><div><small>Ratings</small><h2>{analytics.totalRatings}</h2></div><div><small>Comments</small><h2>{analytics.totalComments}</h2></div><div><small>Followers</small><h2>{analytics.followers}</h2></div></div><h3>Top content</h3>{analytics.stories.slice(0,5).map((item:any)=><div className="manage-story" key={item.id}><div><b>{item.title}</b><small>{item.likes} likes · {item.averageRating.toFixed(2)} average from {item.ratingCount} rating(s) · {item.comments} comments</small></div><Link to={`/story/${item.slug}`} className="text-link">Open <ChevronRight size={14}/></Link></div>)}</section>}
      <div className="workspace-grid">
        <section className="workspace-card profile-editor-card">
          <h2>Edit your public profile</h2>
          <p className="profile-form-hint">Your avatar, bio, and social links appear on your public creator profile. Use full HTTPS links for social accounts.</p>
          <form key={[user?.id,user?.displayName,user?.bio,user?.websiteUrl,user?.instagramUrl,user?.facebookUrl,user?.youtubeUrl,user?.tiktokUrl,user?.githubUrl,user?.linkedinUrl].join("|")} className="auth-form profile-editor-form" onSubmit={saveProfile}>
            <div className="profile-avatar-editor">
              <div className="profile-avatar-preview">{(avatarFile ? URL.createObjectURL(avatarFile) : user?.avatarPath) ? <img src={avatarFile ? URL.createObjectURL(avatarFile) : user.avatarPath} alt="Profile preview"/> : <span>{(user?.displayName || user?.username || "U").slice(0,1).toUpperCase()}</span>}</div>
              <label>Profile picture <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const file=e.target.files?.[0] || null; if(file && file.size > 8*1024*1024){setMessage("Profile pictures must be smaller than 8 MB.");e.target.value="";return;} setAvatarFile(file); }}/><small>JPG, PNG, WEBP, or GIF · max 8 MB</small></label>
            </div>
            <label>Display name<input name="displayName" defaultValue={user?.displayName || ""} maxLength={80} placeholder="Your public name"/></label>
            <label>Bio<textarea name="bio" defaultValue={user?.bio || ""} maxLength={500} rows={3} placeholder="Tell readers about yourself (max 500 characters)"/></label>
            <div className="profile-social-fields"><label>Website<input name="websiteUrl" type="url" defaultValue={user?.websiteUrl || ""} placeholder="https://example.com"/></label><label>Instagram<input name="instagramUrl" type="url" defaultValue={user?.instagramUrl || ""} placeholder="https://instagram.com/username"/></label><label>Facebook<input name="facebookUrl" type="url" defaultValue={user?.facebookUrl || ""} placeholder="https://facebook.com/username"/></label><label>YouTube<input name="youtubeUrl" type="url" defaultValue={user?.youtubeUrl || ""} placeholder="https://youtube.com/@channel"/></label><label>TikTok<input name="tiktokUrl" type="url" defaultValue={user?.tiktokUrl || ""} placeholder="https://tiktok.com/@username"/></label><label>GitHub<input name="githubUrl" type="url" defaultValue={user?.githubUrl || ""} placeholder="https://github.com/username"/></label><label>LinkedIn<input name="linkedinUrl" type="url" defaultValue={user?.linkedinUrl || ""} placeholder="https://linkedin.com/in/username"/></label></div>
            <button className="btn btn-primary" type="submit" disabled={profileBusy}>{profileBusy ? "Saving profile..." : "Save profile"}</button>
          </form>
          <div className="profile-account-meta"><p><b>Username:</b> {user?.username || "N/A"}</p><p><b>Email:</b> {user?.email || "N/A"}</p><p><b>Role:</b> {user?.role || "N/A"}</p><p><b>Status:</b> {user?.accountStatus || "Active"}</p></div>
        </section>

        <section className="workspace-card story-management">
          <h2>Your Published Stories</h2>
          {stories.length ? stories.map(s => (
            <div className="manage-story" key={s.id}>
              <div>
                <b>{s.title}</b>
                <small>{s.chapters?.length || 0} chapter(s) · {s.contentType}</small>
              </div>
              <Link to={`/story/${s.slug}`} className="text-link">View story <ChevronRight size={15}/></Link>
            </div>
          )) : <p>You haven't published any stories yet. Go to Creator Studio to start!</p>}
        </section>
      </div>
    </main>
  );
}

function AdminDashboard() {
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [messageReports, setMessageReports] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const token = localStorage.getItem("ns_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/overview", { headers }).then(r => r.json()),
      fetch("/api/admin/users", { headers }).then(r => r.json()),
      fetch("/api/admin/stories", { headers }).then(r => r.json()),
      fetch("/api/admin/reports", { headers }).then(r => r.json()),
      fetch("/api/admin/message-reports", { headers }).then(r => r.json()),
    ]).then(([a, b, c, d, e]) => {
      if (!a.success) throw new Error(a.message || "Admin access required");
      if (!active) return;
      setOverview(a.data); setUsers(b.data || []); setStories(c.data || []); setReports(d.data || []); setMessageReports(e.data || []);
    }).catch(e => { if (active) setMessage(e instanceof Error ? e.message : "Could not load admin data."); });
    return () => { active = false; };
  }, []);
  const updateUser = async (id: string, body: any) => {
    const r = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not update user.");
    setUsers(old => old.map(u => u.id === id ? { ...u, ...j.data } : u));
  };
  const updateStory = async (id: string, publication: string) => {
    const r = await fetch(`/api/admin/stories/${id}`, { method: "PATCH", headers, body: JSON.stringify({ publication }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not update story.");
    setStories(old => old.map(story => story.id === id ? { ...story, ...j.data } : story));
  };
  const updateReport = async (id: string, status: string) => {
    const r = await fetch(`/api/admin/reports/${id}`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not update report.");
    setReports(old => old.map(report => report.id === id ? { ...report, ...j.data } : report));
  };
  const updateMessageReport = async (id: string, status: string) => {
    const r = await fetch(`/api/admin/message-reports/${id}`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not update message report.");
    setMessageReports(old => old.map(report => report.id === id ? { ...report, ...j.data } : report));
  };
  const captureError = (error: unknown) => setMessage(error instanceof Error ? error.message : "The requested action failed.");
  if (!token) return <main className="inner-page"><div className="page-intro"><div className="eyebrow">SITE ADMINISTRATION</div><h1>Admin <span>dashboard.</span></h1><p>Sign in with an administrator account to continue.</p></div><Link to="/login" className="btn btn-primary">Log in</Link></main>;
  return <main className="inner-page">
    <div className="page-intro"><div className="eyebrow">SITE ADMINISTRATION</div><h1>Admin <span>dashboard.</span></h1><p>Manage users, published content, and submitted reports.</p></div>
    {message && <div className="form-notice" role="alert">{message}</div>}
    {overview && <div className="admin-stats">{Object.entries(overview).map(([key, value]) => <div className="workspace-card" key={key}><small>{key.replace(/[A-Z]/g, " $&")}</small><h2>{String(value)}</h2></div>)}</div>}
    <section className="workspace-card"><h2>User management</h2>{users.length ? users.map(user => <div className="manage-story" key={user.id}><div><b>{user.username}</b><small>{user.email} · {user.accountStatus}</small></div><select aria-label={`Role for ${user.username}`} value={user.role} onChange={e => updateUser(user.id, { role: e.target.value }).catch(captureError)}><option>USER</option><option>CREATOR</option><option>ADMIN</option></select><select aria-label={`Status for ${user.username}`} value={user.accountStatus} onChange={e => updateUser(user.id, { accountStatus: e.target.value }).catch(captureError)}><option>ACTIVE</option><option>SUSPENDED</option><option>DISABLED</option></select></div>) : <p>No users to display.</p>}</section>
    <section className="workspace-card story-management"><h2>Content management</h2>{stories.length ? stories.map(story => <div className="manage-story" key={story.id}><div><b>{story.title}</b><small>by {story.creator?.username || "Unknown creator"} · {story.publication}</small></div><select aria-label={`Publication status for ${story.title}`} value={story.publication} onChange={e => updateStory(story.id, e.target.value).catch(captureError)}><option>PUBLISHED</option><option>UNPUBLISHED</option><option>DRAFT</option></select></div>) : <p>No stories to display.</p>}</section>
    <section className="workspace-card story-management"><h2>Content reports</h2>{reports.length ? reports.map(report => <div className="manage-story" key={report.id}><div><b>{report.story?.title || (report.comment ? "Comment report" : report.review ? "Written review report" : "Content report")}</b><small>{report.review?.body || report.comment?.body || ""}</small><small>Reported by {report.reporter?.username || "Unknown user"} · {report.reason}</small></div><select aria-label={`Report status ${report.id}`} value={report.status} onChange={e => updateReport(report.id, e.target.value).catch(captureError)}><option>PENDING</option><option>REVIEWED</option><option>RESOLVED</option><option>DISMISSED</option></select></div>) : <p>No reports have been submitted.</p>}</section>
    <section className="workspace-card story-management"><h2>Reported private messages</h2><p className="community-muted">Purpose-limited queue: only messages explicitly reported by a participant are shown here.</p>{messageReports.length ? messageReports.map(report => <div className="manage-story" key={report.id}><div><b>Message from {report.message?.sender?.username || "Unknown sender"}</b><small>{report.message?.body || "Message text unavailable"}</small><small>Reported by {report.reporter?.username || "Unknown user"} · {report.reason}</small></div><select aria-label={`Message report status ${report.id}`} value={report.status} onChange={e => updateMessageReport(report.id,e.target.value).catch(captureError)}><option>PENDING</option><option>REVIEWED</option><option>RESOLVED</option><option>DISMISSED</option></select></div>) : <p>No private messages have been reported.</p>}</section>
  </main>;
}

function VideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [user] = useState<any>(() => { try { return JSON.parse(localStorage.getItem("ns_user") || "null"); } catch { return null; } });
  const token = localStorage.getItem("ns_token") || "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("VIDEO");
  const [file, setFile] = useState<File | null>(null);
  const uploadRequest = useRef<XMLHttpRequest | null>(null);
  const refresh = async () => {
    const query = filter === "ALL" ? "" : `?type=${filter}`;
    const response = await fetch(`/api/videos${query}`);
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.message || "Unable to load videos.");
    setVideos(json.data || []);
  };
  useEffect(() => { refresh().catch(error => setMessage(error.message)); }, [filter]);
  const upload = (event: React.FormEvent) => {
    event.preventDefault(); setMessage("");
    if (!token || !["CREATOR", "ADMIN"].includes(user?.role)) { setMessage("Sign in with a creator or administrator account to upload videos."); return; }
    if (!file) { setMessage("Choose an MP4, MOV, or WebM video first."); return; }
    if (file.size > 200 * 1024 * 1024) { setMessage("Video must be smaller than 200 MB."); return; }
    if (!["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"].includes(file.type)) { setMessage("Choose an MP4, MOV, or WebM file."); return; }
    setBusy(true); setProgress(0);
    const query = new URLSearchParams({ title, description, type });
    const xhr = new XMLHttpRequest();
    uploadRequest.current = xhr;
    xhr.open("POST", `/api/videos?${query.toString()}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(json.message || "Upload failed.");
        setMessage("Video uploaded successfully."); setTitle(""); setDescription(""); setFile(null);
        const input = document.getElementById("video-file") as HTMLInputElement | null; if (input) input.value = "";
        refresh().catch(error => setMessage(error.message));
      } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
      finally { setBusy(false); uploadRequest.current = null; }
    };
    xhr.onerror = () => { setMessage("Network error while uploading. Check your connection and try again."); setBusy(false); uploadRequest.current = null; };
    xhr.onabort = () => { setMessage("Upload cancelled."); setBusy(false); uploadRequest.current = null; };
    xhr.send(file);
  };
  return <main className="inner-page videos-page">
    <div className="eyebrow">WATCH SOMETHING NEW</div><h1>Videos <span className="brand-accent">&</span> Short Clips</h1>
    <p className="videos-intro">Discover creator videos and quick vertical stories from the KathaVerse community.</p>
    <div className="video-filter">{[["ALL","All videos"],["SHORT","Short clips"],["VIDEO","Regular videos"]].map(([value,label])=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    {message && <p className="video-message" role="status">{message}</p>}
    {videos.length ? <div className="video-grid">{videos.map(video=><article className="video-card" key={video.id}>
      <video controls preload="metadata" playsInline src={video.filePath} aria-label={video.title}/>
      <div className="video-card-info"><span className="video-type">{video.type==="SHORT"?"SHORT CLIP":"VIDEO"}</span><h2>{video.title}</h2><p>{video.description || "No description provided."}</p><small>By {video.uploader?.displayName || video.uploader?.username || "Creator"} · {new Date(video.createdAt).toLocaleDateString()}</small>
      {token && (user?.role==="ADMIN" || video.uploader?.username===user?.username) && <button className="video-delete" onClick={async()=>{if(!window.confirm("Delete this video permanently?"))return;try{const response=await fetch(`/api/videos/${video.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});const json=await response.json();if(!response.ok)throw new Error(json.message||"Delete failed.");setVideos(current=>current.filter(item=>item.id!==video.id));setMessage("Video deleted.");}catch(error){setMessage(error instanceof Error?error.message:"Delete failed.");}}}>Delete video</button>}</div>
    </article>)}</div> : <div className="video-empty"><Video size={32}/><h2>No videos here yet</h2><p>When creators publish videos, they will appear here.</p></div>}
    {["CREATOR","ADMIN"].includes(user?.role) && <section className="video-upload-panel"><div className="eyebrow"><Upload size={13}/> CREATOR WORKSPACE</div><h2>Upload a video</h2><p>MP4, MOV, or WebM · maximum 200 MB. MOV uploads are accepted only when they use an MP4-compatible container.</p>
      <form onSubmit={upload} className="video-upload-form"><label>Video title<input required minLength={2} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your video a title"/></label>
      <label>Description<textarea maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this video about?"/></label>
      <label>Content type<select value={type} onChange={e=>setType(e.target.value)}><option value="VIDEO">Regular video</option><option value="SHORT">Short clip</option></select></label>
      <label className="video-file-label">Choose video<input id="video-file" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      {file && <small>{file.name} · {(file.size/1024/1024).toFixed(1)} MB</small>}
      {busy && <div className="upload-progress"><span style={{width:`${progress}%`}}/></div>}
      <div className="video-upload-actions"><button className="btn btn-primary" disabled={busy}>{busy?`Uploading ${progress}%`:"Publish video"}</button>{busy && <button type="button" className="video-cancel" onClick={()=>uploadRequest.current?.abort()}>Cancel upload</button>}</div></form>
    </section>}
  </main>;
}


function MessagesPage() {
  const token = localStorage.getItem("ns_token") || "";
  const [conversations, setConversations] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  async function loadInbox() {
    const r = await fetch("/api/messages", { headers });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not load inbox.");
    setConversations(j.data || []);
  }
  async function openConversation(c: any) {
    setActive(c); setError("");
    const r = await fetch(`/api/messages/${c.id}`, { headers });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not load messages.");
    setMessages(j.data || []); await loadInbox();
  }
  useEffect(() => {
    if (!token) return;
    loadInbox().catch(e => setError(e.message));
    const target = new URLSearchParams(window.location.search).get("recipient");
    if (target) {
      fetch("/api/messages/conversations", { method: "POST", headers, body: JSON.stringify({ recipientId: target }) })
        .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not start conversation."); return j; })
        .then(async j => { await openConversation(j.data); })
        .catch(e => setError(e instanceof Error ? e.message : "Could not start conversation."));
    }
  }, []);
  useEffect(() => {
    if (!token || !active?.id) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/messages/${active.id}`, { headers }); const j = await r.json();
        if (alive && r.ok && j.success) setMessages(current => {
          const known = new Map(current.map(m => [m.id, m]));
          for (const m of (j.data || [])) known.set(m.id, m);
          return [...known.values()].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
        });
        if (alive) await loadInbox();
      } catch { /* Polling is a fallback; keep visible messages while offline. */ }
    };
    const timer = window.setInterval(poll, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token, active?.id]);
  async function startConversation(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/messages/conversations", { method: "POST", headers, body: JSON.stringify({ recipientId }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not start conversation.");
      await loadInbox(); await openConversation(j.data); setRecipientId("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not start conversation."); } finally { setBusy(false); }
  }
  async function updateMessage(m:any, action:"edit"|"delete") {
    if (!active) return;
    if (action === "delete") {
      if (!window.confirm("Delete this message? Its text will be replaced with a deleted-message marker for both participants.")) return;
      try { const r=await fetch(`/api/messages/message/${m.id}`,{method:"DELETE",headers});const j=await r.json();if(!r.ok)throw new Error(j.message||"Could not delete message.");setMessages(old=>old.map(item=>item.id===m.id?{...item,deletedAt:new Date().toISOString(),body:"Message deleted"}:item)); }
      catch(e){setError(e instanceof Error?e.message:"Could not delete message.");}
      return;
    }
    const next=window.prompt("Edit message (available for 15 minutes after sending)",m.body);if(next===null||!next.trim()||next===m.body)return;
    try {const r=await fetch(`/api/messages/message/${m.id}`,{method:"PATCH",headers,body:JSON.stringify({body:next})});const j=await r.json();if(!r.ok)throw new Error(j.message||"Could not edit message.");setMessages(old=>old.map(item=>item.id===m.id?j.data:item));}
    catch(e){setError(e instanceof Error?e.message:"Could not edit message.");}
  }
  async function reportMessage(m:any) {
    const reason=window.prompt("Why are you reporting this message? (At least 5 characters)");if(!reason)return;
    try {const r=await fetch(`/api/messages/message/${m.id}/report`,{method:"POST",headers,body:JSON.stringify({reason})});const j=await r.json();if(!r.ok)throw new Error(j.message||"Could not report message.");setError(j.message||"Message report submitted.");}
    catch(e){setError(e instanceof Error?e.message:"Could not report message.");}
  }
  async function updateConversationSetting(setting:"muted"|"archived", value:boolean) {
    if(!active)return;
    try {const r=await fetch(`/api/messages/${active.id}/settings`,{method:"PATCH",headers,body:JSON.stringify(setting==="muted"?{muted:value}:{archived:value})});const j=await r.json();if(!r.ok)throw new Error(j.message||"Could not update conversation.");if(setting==="archived"&&value){setConversations(old=>old.filter(c=>c.id!==active.id));setActive(null);setMessages([]);}else setConversations(old=>old.map(c=>c.id===active.id?{...c,[setting]:value}:c));}
    catch(e){setError(e instanceof Error?e.message:"Could not update conversation.");}
  }
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault(); if (!active || !body.trim()) return; setBusy(true); setError("");
    try {
      const r = await fetch(`/api/messages/${active.id}`, { method: "POST", headers, body: JSON.stringify({ body }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message || "Message could not be sent.");
      setMessages(old => [...old, j.data]); setBody(""); await loadInbox();
    } catch(e) { setError(e instanceof Error ? e.message : "Message could not be sent."); } finally { setBusy(false); }
  }
  if (!token) return <main className="content-section"><div className="empty-state"><h2>Log in to use messages</h2><Link className="btn btn-primary" to="/login">Log in</Link></div></main>;
  return <main className="content-section">
    <div className="section-heading"><div><div className="eyebrow">PRIVATE COMMUNITY</div><h2>Messages</h2></div></div>
    {error && <p role="alert" style={{color:"#ff8d9c"}}>{error}</p>}
    <form onSubmit={startConversation} className="video-upload-form" style={{maxWidth:600,marginBottom:24}}>
      <label>Start a conversation with a user ID<input value={recipientId} onChange={e=>setRecipientId(e.target.value)} required placeholder="Paste the recipient's user ID"/></label>
      <button className="btn btn-primary" disabled={busy}>Start conversation</button>
    </form>
    <div style={{display:"grid",gridTemplateColumns:"minmax(220px, .8fr) minmax(0, 1.6fr)",gap:20,minHeight:420}}>
      <aside style={{border:"1px solid var(--line, #333)",borderRadius:16,padding:12}}>
        <h3>Inbox</h3>{conversations.length===0 && <p>No conversations yet.</p>}
        {conversations.map(c => { const other=c.participants?.find((p:any)=>p.id!==JSON.parse(localStorage.getItem("ns_user")||"{}").id); return <button key={c.id} onClick={()=>openConversation(c).catch(e=>setError(e.message))} style={{display:"block",width:"100%",textAlign:"left",padding:12,marginBottom:8,borderRadius:10,border:"1px solid var(--line, #333)",background:active?.id===c.id?"rgba(153,91,255,.16)":"transparent",color:"inherit",cursor:"pointer"}}><strong>{other?.displayName||other?.username||"Conversation"}</strong><p style={{margin:"6px 0",opacity:.7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.lastMessage?.body||"No messages yet"}</p>{c.unread>0&&<small>{c.unread} unread</small>}</button>; })}
      </aside>
      <section style={{border:"1px solid var(--line, #333)",borderRadius:16,padding:16,display:"flex",flexDirection:"column",minWidth:0}}>
        {!active ? <div className="empty-state"><h3>Select a conversation</h3><p>Your private message history will appear here.</p></div> : <>
          <div className="message-toolbar"><span>Private conversation</span><div><button type="button" onClick={()=>void updateConversationSetting("muted",!Boolean(conversations.find(c=>c.id===active.id)?.muted))}>{conversations.find(c=>c.id===active.id)?.muted?"Unmute":"Mute"}</button><button type="button" onClick={()=>void updateConversationSetting("archived",true)}>Archive</button></div></div>
          <div style={{flex:1,overflowY:"auto",maxHeight:480,display:"flex",flexDirection:"column",gap:10,paddingBottom:16}}>
            {messages.map(m=>{const mine=m.senderId===JSON.parse(localStorage.getItem("ns_user")||"{}").id;return <div key={m.id} style={{alignSelf:mine?"flex-end":"flex-start",maxWidth:"85%",background:"rgba(153,91,255,.13)",border:"1px solid var(--line, #333)",borderRadius:12,padding:"10px 12px"}}><p style={{margin:0,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{m.body}</p><small style={{opacity:.65}}>{new Date(m.createdAt).toLocaleString()}{m.editedAt?" · edited":""}</small>{mine&&!m.deletedAt&&<div className="message-actions"><button type="button" onClick={()=>void updateMessage(m,"edit")}>Edit</button><button type="button" onClick={()=>void updateMessage(m,"delete")}>Delete message</button></div>}{!mine&&!m.deletedAt&&<div className="message-actions"><button type="button" onClick={()=>void reportMessage(m)}>Report message</button></div>}</div>})}
          </div>
          <form onSubmit={sendMessage} style={{display:"flex",gap:8}}><input aria-label="Message" value={body} onChange={e=>setBody(e.target.value)} maxLength={4000} required placeholder="Write a message..." style={{flex:1,minWidth:0}}/><button className="btn btn-primary" disabled={busy||!body.trim()}>Send</button></form>
        </>}
      </section>
    </div>
  </main>;
}

function NotificationsPage() {
  const token = localStorage.getItem("ns_token") || "";
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [preferences, setPreferences] = useState<any>({ likes: true, follows: true, comments: true, messages: true, newChapters: true });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  async function load() {
    const r = await fetch("/api/notifications?limit=50", { headers });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not load notifications.");
    setItems(j.data || []); setUnread(j.unread || 0);
  }
  async function loadPreferences() {
    const r = await fetch("/api/notification-preferences", { headers });
    const j = await r.json(); if (!r.ok) throw new Error(j.message || "Could not load preferences.");
    setPreferences(j.data);
  }
  useEffect(() => { if (token) Promise.all([load(), loadPreferences()]).catch(e => setError(e.message)); }, []);
  async function markRead(id: string) {
    const r = await fetch(`/api/notifications/${id}/read`, { method: "PATCH", headers });
    const j = await r.json(); if (!r.ok) { setError(j.message || "Could not update notification."); return; }
    setItems(old => old.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)); setUnread(n => Math.max(0, n - 1));
  }
  async function markAllRead() {
    const r = await fetch("/api/notifications/read-all", { method: "POST", headers });
    const j = await r.json(); if (!r.ok) { setError(j.message || "Could not update notifications."); return; }
    setItems(old => old.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }))); setUnread(0);
  }
  async function savePreferences(e: React.FormEvent) {
    e.preventDefault(); setSaved(false);
    const r = await fetch("/api/notification-preferences", { method: "PUT", headers, body: JSON.stringify(preferences) });
    const j = await r.json(); if (!r.ok) { setError(j.message || "Could not save preferences."); return; }
    setPreferences(j.data); setSaved(true);
  }
  if (!token) return <main className="inner-page"><div className="empty-state"><Bell/><h2>Log in to view notifications</h2><Link className="btn btn-primary" to="/login">Log in</Link></div></main>;
  return <main className="inner-page notifications-page">
    <div className="page-intro"><div className="eyebrow"><Bell size={14}/> YOUR COMMUNITY</div><h1>Notifications<span>.</span></h1><p>Keep up with likes, messages, and activity across KathaVerse.</p></div>
    {error && <p role="alert" className="community-error">{error}</p>}
    <section className="workspace-card"><div className="community-heading"><div><h2>Recent activity</h2><p className="community-muted">{unread} unread notification(s)</p></div><button className="btn btn-outline" onClick={markAllRead} disabled={!unread}>Mark all as read</button></div>
      {items.length ? <div className="notification-list">{items.map(n => <article key={n.id} className={`notification-item ${n.readAt ? "is-read" : "is-unread"}`}>
        <div className="notification-dot"/><div className="notification-copy"><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div>
        {!n.readAt && <button className="text-link" onClick={() => markRead(n.id)}>Mark read</button>}
        {n.link && <Link className="text-link" to={n.link}>Open <ChevronRight size={14}/></Link>}
      </article>)}</div> : <div className="empty-state"><Bell size={28}/><h3>You're all caught up</h3><p>New community activity will appear here.</p></div>}
    </section>
    <section className="workspace-card notification-settings"><div className="eyebrow"><Settings size={13}/> PREFERENCES</div><h2>Choose what you hear about</h2><form onSubmit={savePreferences}>
      {([["likes","Likes on your content"],["follows","New creator followers"],["comments","Comments and replies"],["messages","Private messages"],["newChapters","New chapters and episodes"]] as [string,string][]).map(([key,label]) => <label key={key} className="preference-row"><span>{label}</span><input type="checkbox" checked={Boolean(preferences[key])} onChange={e => setPreferences((p:any) => ({ ...p, [key]: e.target.checked }))}/></label>)}
      <button className="btn btn-primary" type="submit">Save preferences</button>{saved && <span className="community-muted" role="status">Preferences saved.</span>}
    </form></section>
  </main>;
}

function NotFound() {
  return <main className="empty-state not-found"><span className="not-found-code">404</span><h1>Lost between worlds?</h1><p>We couldn't find the page you were looking for.</p><Link to="/" className="btn btn-primary">Return home <ArrowUpRight size={16}/></Link></main>;
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><Link to="/" className="brand"><span className="brand-mark"><BookOpen size={19}/></span><span>Katha<span className="brand-accent">Verse</span><small>.com</small></span></Link><p>A home for stories still waiting to be told.</p><div className="social-links"><a href="https://github.com" aria-label="GitHub"><Github size={16}/></a><a href="https://instagram.com" aria-label="Instagram"><Instagram size={16}/></a><a href="mailto:hello@KathaVerse.com" aria-label="Email"><Mail size={16}/></a></div></div><div className="footer-column"><b>EXPLORE</b><Link to="/discover">Discover stories</Link><a href="/#latest">Latest updates</a><a href="/#genres">Genres</a></div><div className="footer-column"><b>COMMUNITY</b><Link to="/register">Become a creator</Link><Link to="/bookmarks">Your library</Link><a href="mailto:hello@KathaVerse.com">Contact</a></div><div className="footer-column"><b>KathaVerse</b><a href="#about">About us</a><a href="#privacy">Privacy policy</a><a href="#terms">Terms of use</a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} KathaVerse.com</span><span>Made for the love of stories <Heart size={13}/></span><span className="footer-disclaimer">Fictional demo project · Sample content</span></div></footer>;
}

export default function App() {
  return <StoryCatalogProvider><Header/><Routes><Route path="/" element={<Home/>}/><Route path="/discover" element={<Discover/>}/><Route path="/videos" element={<VideosPage/>}/><Route path="/story/:slug" element={<StoryDetails/>}/><Route path="/creators/:creatorId" element={<CreatorProfile/>}/><Route path="/read/:slug/:chapter" element={<Reader/>}/><Route path="/bookmarks" element={<Bookmarks/>}/><Route path="/login" element={<AuthPage/>}/><Route path="/admin/login" element={<AuthPage/>}/><Route path="/register" element={<AuthPage register/>}/><Route path="/creator" element={<CreatorStudio/>}/><Route path="/profile" element={<UserProfile/>}/><Route path="/messages" element={<MessagesPage/>}/><Route path="/notifications" element={<NotificationsPage/>}/><Route path="/admin" element={<AdminDashboard/>}/><Route path="*" element={<NotFound/>}/></Routes><Footer/></StoryCatalogProvider>;
}