const SUPABASE_URL = "https://ejzsgdeskmrbjifffmgi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_E1UjcZZa0Jaml2oAikrkNQ_dt6CbeVo";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  user: null,
  topics: [],
  posts: [],
  votes: new Set(),
  currentPost: null,
  comments: [],
  stats: { members: 0, discussions: 0, comments: 0, topics: 0 },
  menuPost: null,
  menuComment: null
};

const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));
const initials = name => {
  const clean = String(name || "?").trim();
  return esc(clean ? clean[0].toUpperCase() : "?");
};
const formatTime = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60000, hour = 60 * minute, day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const topicBySlug = slug => state.topics.find(topic => topic.slug === slug);
const topicById = id => state.topics.find(topic => Number(topic.id) === Number(id));
const currentHash = () => location.hash.slice(1) || "home";

function note(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.__seedStormToast);
  window.__seedStormToast = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setBusy(button, busy = true) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("busy", busy);
}

function closeModal() {
  modal.hidden = true;
  modal.innerHTML = "";
}

function openModal(html) {
  modal.innerHTML = `<div class="dialog">${html}</div>`;
  modal.hidden = false;
}

function topicsMarkup() {
  return state.topics.map(topic => `<a class="topiclink" href="#topic/${esc(topic.slug)}"><span>${esc(topic.icon)} ${esc(topic.name)}</span><b>→</b></a>`).join("");
}

function postCard(post) {
  const author = post.profiles?.username || "member";
  const topic = post.topics?.name || topicById(post.topic_id)?.name || "Topic";
  const voted = state.votes.has(post.id);
  return `<article class="card" data-post-card="${esc(post.id)}">
    <div class="top">
      <span class="avatar" aria-hidden="true">${initials(author)}</span>
      <div><div class="author">${esc(author)}</div><div class="time">${formatTime(post.created_at)}</div></div>
      <span class="type">${esc(post.post_type)}</span>
      <button class="menu" type="button" aria-label="Post actions" data-post-menu="${esc(post.id)}">⋯</button>
    </div>
    <a href="#post/${esc(post.id)}"><h3>${esc(post.title)}</h3><p>${esc(post.body)}</p></a>
    <div class="chips">
      <button class="chip chip-btn ${voted ? "on" : ""}" type="button" data-vote="${esc(post.id)}" aria-pressed="${voted}">▲ <span class="count">${Number(post.vote_count || 0)}</span></button>
      <a class="chip" href="#post/${esc(post.id)}">◌ <span class="count">${Number(post.comment_count || 0)}</span> comments</a>
      <a class="chip" href="#topic/${esc(post.topics?.slug || topicById(post.topic_id)?.slug || "")}">${esc(topic)}</a>
    </div>
  </article>`;
}

function commentMarkup(comment) {
  const author = comment.profiles?.username || "member";
  return `<div class="comment ${comment.parent_id ? "nested" : ""}" data-comment-id="${esc(comment.id)}">
    <span class="avatar" aria-hidden="true">${initials(author)}</span>
    <div class="comment-body">
      <div class="top"><div><b>${esc(author)}</b><div class="time">${formatTime(comment.created_at)}</div></div><button class="menu" type="button" aria-label="Comment actions" data-comment-menu="${esc(comment.id)}">⋯</button></div>
      <p class="muted">${esc(comment.body)}</p>
      ${comment.parent_id ? "" : `<button class="chip" type="button" data-reply="${esc(comment.id)}">Reply</button>`}
    </div>
  </div>`;
}

async function loadTopics() {
  const { data, error } = await sb.from("topics").select("id,slug,name,description,icon").order("id");
  if (error) throw error;
  state.topics = data || [];
  state.stats.topics = state.topics.length;
}

async function loadStats() {
  const [members, discussions, comments] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("posts").select("id", { count: "exact", head: true }),
    sb.from("comments").select("id", { count: "exact", head: true })
  ]);
  if (members.error) throw members.error;
  if (discussions.error) throw discussions.error;
  if (comments.error) throw comments.error;
  state.stats.members = members.count || 0;
  state.stats.discussions = discussions.count || 0;
  state.stats.comments = comments.count || 0;
}

async function loadPosts({ sort = "latest", type = "", topicId = "", query = "" } = {}) {
  let request = sb
    .from("posts")
    .select("id,author_id,topic_id,post_type,title,body,vote_count,comment_count,created_at,updated_at,topics:topics!posts_topic_id_fkey(slug,name,icon),profiles:profiles!posts_author_id_fkey(username,avatar_seed)")
    .limit(50);

  if (type) request = request.eq("post_type", type);
  if (topicId) request = request.eq("topic_id", topicId);
  if (query) {
    const safeQuery = query.replace(/[\\%_]/g, char => `\\${char}`).replace(/[(),]/g, " ");
    request = request.or(`title.ilike.%${safeQuery}%,body.ilike.%${safeQuery}%`);
  }

  if (sort === "top") request = request.order("vote_count", { ascending: false }).order("created_at", { ascending: false });
  else request = request.order("created_at", { ascending: false });

  const { data, error } = await request;
  if (error) throw error;
  state.posts = data || [];
  state.votes = new Set();

  if (state.user && state.posts.length) {
    const ids = state.posts.map(post => post.id);
    const mine = await sb.from("post_votes").select("post_id").in("post_id", ids);
    if (mine.error) throw mine.error;
    state.votes = new Set((mine.data || []).map(row => row.post_id));
  }
}

async function loadComments(postId) {
  const { data, error } = await sb
    .from("comments")
    .select("id,post_id,author_id,parent_id,body,created_at,updated_at,profiles:profiles!comments_author_id_fkey(username,avatar_seed)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  state.comments = data || [];
}

function shell(content) { return `<div class="shell">${content}</div>`; }

function homePage(sort = "latest") {
  const postsHtml = state.posts.length ? state.posts.map(postCard).join("") : `<div class="empty"><h3>No community posts yet.</h3><p class="muted">Be one of the first people to start the conversation.</p><a class="btn primary" href="#create">Create the first post</a></div>`;
  return shell(`<section class="hero"><div><div class="eyebrow">A community for the planet</div><h1>The planet is huge.<br><span>We don't have to face</span><br>its problems alone.</h1><p>Ask questions. Share discoveries. Build projects. Seed Storm Community is a human network for people who care about the environment.</p><div class="actions"><a class="btn primary" href="#explore">Explore Community</a><a class="btn" href="#profile">${state.user ? "Your profile" : "Join the conversation"}</a></div></div><aside class="pulse"><h3>Community pulse</h3><div class="stats"><div class="stat"><b>${state.stats.members.toLocaleString()}</b><small>Members</small></div><div class="stat"><b>${state.stats.discussions.toLocaleString()}</b><small>Discussions</small></div><div class="stat"><b>${state.stats.comments.toLocaleString()}</b><small>Comments</small></div><div class="stat"><b>${state.stats.topics}</b><small>Topics</small></div></div></aside></section><section class="section"><div class="layout"><div><div class="tabs"><button class="${sort === "latest" ? "on" : ""}" type="button" data-home-sort="latest">Latest</button><button class="${sort === "top" ? "on" : ""}" type="button" data-home-sort="top">Top</button><button class="${sort === "questions" ? "on" : ""}" type="button" data-home-sort="questions">Questions</button></div>${postsHtml}</div><aside class="side"><div class="sidebox"><h3>Why Seed Storm?</h3><p class="muted">This is a human knowledge network. Community posts are discussions and experiences, not automatically verified facts.</p></div><div class="sidebox"><h3>Topics</h3><div class="topiclist">${topicsMarkup()}</div></div></aside></div></section>`);
}

function explorePage(query = "", type = "") {
  const postsHtml = state.posts.length ? state.posts.map(postCard).join("") : `<div class="empty"><h3>Nothing matched.</h3><p class="muted">Try a different search or browse a topic.</p></div>`;
  return shell(`<div class="page"><div class="eyebrow">Discovery</div><h1>Explore</h1><p class="muted">Find discussions, projects and observations${query ? ` for “${esc(query)}”` : ""}.</p></div><div class="layout"><div>${type ? `<div class="chips"><span class="chip">Filter: ${esc(type)}</span><a class="chip" href="#explore">Clear</a></div>` : ""}${postsHtml}</div><aside class="side"><div class="sidebox"><h3>Browse by topic</h3><div class="topiclist">${topicsMarkup()}</div></div></aside></div>`);
}

function topicsPage() {
  return shell(`<div class="page"><div class="eyebrow">Explore knowledge</div><h1>Topics</h1><p class="muted">Eight focused spaces keep V1 simple and useful.</p></div><div class="topicgrid">${state.topics.map(topic => `<a class="topic" href="#topic/${esc(topic.slug)}"><span>${esc(topic.icon)}</span><b>${esc(topic.name)}</b><p>${esc(topic.description)}</p></a>`).join("")}</div>`);
}

function topicPage(slug) {
  const topic = topicBySlug(slug);
  if (!topic) return shell(`<div class="page"><div class="form"><h2>Topic not found.</h2><a class="btn" href="#topics">Back to topics</a></div></div>`);
  const postsHtml = state.posts.length ? state.posts.map(postCard).join("") : `<div class="empty"><h3>No discussions here yet.</h3><p class="muted">Start the first conversation in ${esc(topic.name)}.</p><a class="btn primary" href="#create">Create a post</a></div>`;
  return shell(`<div class="page"><div class="eyebrow">${esc(topic.icon)} Topic</div><h1>${esc(topic.name)}</h1><p class="muted">${esc(topic.description)}</p></div><div class="layout"><div>${postsHtml}</div><aside class="side"><div class="sidebox"><h3>Keep it useful</h3><p class="muted">Share what you know, explain uncertainty and keep discussions respectful.</p></div></aside></div>`);
}

function createPage() {
  if (!state.user) return shell(`<div class="page"><div class="eyebrow">Community contribution</div><h1>Create a post</h1><div class="form"><div class="notice">You need an account to publish. Your email stays private to your account.</div><a class="btn primary" href="#profile">Sign in / create account</a></div></div>`);
  return shell(`<div class="page"><div class="eyebrow">Community contribution</div><h1>Create a post</h1><p class="muted">Share a question, discussion, project or observation.</p></div><div class="form"><div class="notice">Text-first V1. No image uploads, rich text or exact-location collection.</div><form id="create-form"><div class="field"><label for="title">Title</label><input id="title" maxlength="140" required></div><div class="field"><label for="ptopic">Topic</label><select id="ptopic">${state.topics.map(topic => `<option value="${esc(topic.id)}">${esc(topic.name)}</option>`).join("")}</select></div><div class="field"><label for="ptype">Post type</label><select id="ptype"><option>Question</option><option>Discussion</option><option>Project</option><option>Observation</option></select></div><div class="field"><label for="body">Body</label><textarea id="body" maxlength="5000" required></textarea><span class="hint">Plain text only.</span></div><button class="btn primary" type="submit">Publish post</button></form></div>`);
}

function profilePage() {
  if (!state.user) return shell(`<div class="page"><div class="eyebrow">Your community identity</div><h1>Profile</h1></div><div class="form"><div class="auth-switch"><button class="btn primary" type="button" data-auth-tab="signin">Sign in</button><button class="btn" type="button" data-auth-tab="signup">Create account</button></div><div id="auth-panel"></div></div>`);
  const username = state.user.user_metadata?.username || "member";
  return shell(`<div class="page"><div class="eyebrow">Your community identity</div><h1>Profile</h1></div><div class="form"><div class="top"><span class="avatar" style="width:60px;height:60px">${initials(username)}</span><div><h2 style="margin:0">${esc(username)}</h2><span class="muted">Member account</span></div></div><div class="notice" style="margin-top:20px">Your email is used for authentication and recovery. It is not displayed as your public profile identity.</div><button class="btn" type="button" id="signout">Sign out</button></div>`);
}

function signInForm() {
  return `<form id="signin-form"><div class="field"><label for="signin-email">Email</label><input id="signin-email" type="email" autocomplete="email" required></div><div class="field"><label for="signin-password">Password</label><input id="signin-password" type="password" autocomplete="current-password" required></div><button class="btn primary" type="submit">Sign in</button></form>`;
}

function signUpForm() {
  return `<form id="signup-form"><div class="field"><label for="signup-username">Username</label><input id="signup-username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" required><span class="hint">3–24 letters, numbers or underscores.</span></div><div class="field"><label for="signup-email">Email</label><input id="signup-email" type="email" autocomplete="email" required></div><div class="field"><label for="signup-password">Password</label><input id="signup-password" type="password" autocomplete="new-password" minlength="8" required></div><div class="field"><label for="signup-password-2">Confirm password</label><input id="signup-password-2" type="password" autocomplete="new-password" minlength="8" required></div><button class="btn primary" type="submit">Create account</button></form>`;
}

async function renderAuthPanel(mode = "signin") {
  const panel = document.querySelector("#auth-panel");
  if (!panel) return;
  panel.innerHTML = mode === "signup" ? signUpForm() : signInForm();
}

function detailPage(post) {
  const topic = post.topics?.name || topicById(post.topic_id)?.name || "Topic";
  const comments = state.comments || [];
  const children = new Map();
  for (const comment of comments) {
    const parent = comment.parent_id || null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(comment);
  }
  const renderThread = (parent = null) => (children.get(parent) || []).map(comment => `${commentMarkup(comment)}${renderThread(comment.id)}`).join("");
  return shell(`<div class="page"><a class="muted" href="#home">← Back to feed</a></div><div class="layout"><div><article class="card"><div class="top"><span class="avatar" aria-hidden="true">${initials(post.profiles?.username || "member")}</span><div><div class="author">${esc(post.profiles?.username || "member")}</div><div class="time">${formatTime(post.created_at)}</div></div><span class="type">${esc(post.post_type)}</span><button class="menu" type="button" aria-label="Post actions" data-post-menu="${esc(post.id)}">⋯</button></div><h3>${esc(post.title)}</h3><p>${esc(post.body)}</p><div class="chips"><span class="chip">▲ ${Number(post.vote_count || 0)}</span><span class="chip">◌ ${Number(post.comment_count || 0)} comments</span><a class="chip" href="#topic/${esc(post.topics?.slug || topicById(post.topic_id)?.slug || "")}">${esc(topic)}</a></div></article><section class="section"><h2>Comments (${comments.length})</h2>${comments.length ? renderThread() : `<div class="empty"><p class="muted">No comments yet.</p></div>`}${state.user ? `<form id="comment-form" class="form" style="margin-top:18px"><div class="field"><label for="comment">Add a comment</label><textarea id="comment" maxlength="2000" required></textarea></div><button class="btn primary" type="submit">Comment</button></form>` : `<div class="notice">Sign in to join the discussion. <a href="#profile">Open your profile →</a></div>`}</section></div><aside class="side"><div class="sidebox"><h3>${esc(topic)}</h3><p class="muted">A focused space for related environmental discussion.</p></div></aside></div>`);
}

async function loadPostDetail(id) {
  const { data, error } = await sb.from("posts").select("id,author_id,topic_id,post_type,title,body,vote_count,comment_count,created_at,updated_at,topics:topics!posts_topic_id_fkey(slug,name,icon),profiles:profiles!posts_author_id_fkey(username,avatar_seed)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Post not found");
  state.currentPost = data;
  await loadComments(id);
}

function authErrorMessage(error) {
  const message = String(error?.message || "");
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/already registered|already exists/i.test(message)) return "That email is already registered.";
  if (/username/i.test(message) && /unique|duplicate|taken/i.test(message)) return "That username is already taken.";
  return message || "Something went wrong.";
}

async function submitPost(event) {
  event.preventDefault();
  if (!state.user) return note("Sign in first.");
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const title = document.querySelector("#title").value.trim();
  const topicId = Number(document.querySelector("#ptopic").value);
  const postType = document.querySelector("#ptype").value;
  const body = document.querySelector("#body").value.trim();
  if (!title || !body) return;
  setBusy(button);
  try {
    const { error } = await sb.from("posts").insert({ topic_id: topicId, post_type: postType, title, body });
    if (error) throw error;
    note("Post published.");
    location.hash = "home";
  } catch (error) {
    note(authErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

async function submitComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const field = form.querySelector("#comment");
  const body = field?.value.trim() || "";
  const parentId = form.dataset.parentId || null;
  if (!body) {
    note("Write a comment first.");
    field?.focus();
    return;
  }

  if (!state.currentPost) {
    note("Open the post again and try once more.");
    return;
  }

  setBusy(button);
  try {
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user || state.user;
    if (!user) {
      state.user = null;
      note("Your session expired. Please sign in again.");
      location.hash = "profile";
      return;
    }

    const payload = {
      post_id: state.currentPost.id,
      parent_id: parentId,
      body
    };

    const { error } = await sb.from("comments").insert(payload);
    if (error) throw error;

    form.reset();
    delete form.dataset.parentId;
    note("Comment added.");
    await loadPostDetail(state.currentPost.id);
    app.innerHTML = detailPage(state.currentPost);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    note(authErrorMessage(error));
    console.error("Seed Storm comment error:", error);
  } finally {
    setBusy(button, false);
  }
}

async function toggleVote(postId) {
  if (!state.user) return note("Sign in to vote.");
  const already = state.votes.has(postId);
  try {
    if (already) {
      const { error } = await sb.from("post_votes").delete().eq("post_id", postId);
      if (error) throw error;
      state.votes.delete(postId);
      note("Vote removed.");
    } else {
      const { error } = await sb.from("post_votes").insert({ post_id: postId });
      if (error) {
        if (/duplicate|unique/i.test(String(error.message || ""))) note("Already voted.");
        else throw error;
      } else {
        state.votes.add(postId);
        note("Upvoted.");
      }
    }
    await rerenderCurrentRoute();
  } catch (error) {
    note(authErrorMessage(error));
  }
}

function postMenu(postId) {
  const post = state.posts.find(item => item.id === postId) || state.currentPost;
  if (!post) return;
  const own = state.user && state.user.id === post.author_id;
  openModal(`<button class="close" type="button" data-close-modal aria-label="Close">×</button><h2>Post actions</h2><div class="menu-list"><button type="button" data-report-post="${esc(post.id)}">Report post</button>${state.user && !own ? `<button type="button" data-block-user="${esc(post.author_id)}">Block @${esc(post.profiles?.username || "member")}</button>` : ""}${own ? `<button type="button" data-edit-post="${esc(post.id)}">Edit post</button><button type="button" class="danger" data-delete-post="${esc(post.id)}">Delete post</button>` : ""}</div>`);
}

async function blockUser(userId) {
  if (!state.user) return note("Sign in first.");
  try {
    const { error } = await sb.from("blocks").insert({ blocked_id: userId });
    if (error) throw error;
    closeModal();
    note("User blocked. Their posts and comments are hidden from your feed.");
    await rerenderCurrentRoute();
  } catch (error) {
    note(authErrorMessage(error));
  }
}

function reportDialog(type, id) {
  if (!state.user) return note("Sign in to report content.");
  openModal(`<button class="close" type="button" data-close-modal aria-label="Close">×</button><h2>Report ${type}</h2><p class="muted small">Reports are private and visible to the moderation system, not to the reported user.</p><form id="report-form" data-target-type="${esc(type)}" data-target-id="${esc(id)}"><div class="field"><label for="report-reason">Reason</label><select id="report-reason"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="hate">Hate</option><option value="scam">Scam</option><option value="dangerous">Dangerous</option><option value="privacy">Privacy</option><option value="off_topic">Off topic</option><option value="other">Other</option></select></div><div class="field"><label for="report-details">Details</label><textarea id="report-details" maxlength="1000" placeholder="Optional context"></textarea></div><button class="btn primary" type="submit">Send report</button></form>`);
}

async function submitReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  setBusy(button);
  try {
    const payload = {
      target_type: form.dataset.targetType,
      target_id: form.dataset.targetId,
      reason: document.querySelector("#report-reason").value,
      details: document.querySelector("#report-details").value.trim()
    };
    const { error } = await sb.from("reports").insert(payload);
    if (error) {
      if (/duplicate|unique/i.test(String(error.message || ""))) {
        closeModal();
        return note("You already reported this content.");
      }
      throw error;
    }
    closeModal();
    note("Report sent.");
  } catch (error) {
    note(authErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

function editPostDialog(post) {
  const topicId = post.topic_id;
  openModal(`<button class="close" type="button" data-close-modal aria-label="Close">×</button><h2>Edit post</h2><form id="edit-post-form" data-post-id="${esc(post.id)}"><div class="field"><label for="edit-title">Title</label><input id="edit-title" maxlength="140" value="${esc(post.title)}" required></div><div class="field"><label for="edit-topic">Topic</label><select id="edit-topic">${state.topics.map(topic => `<option value="${esc(topic.id)}" ${Number(topic.id) === Number(topicId) ? "selected" : ""}>${esc(topic.name)}</option>`).join("")}</select></div><div class="field"><label for="edit-type">Post type</label><select id="edit-type">${["Question","Discussion","Project","Observation"].map(type => `<option ${type === post.post_type ? "selected" : ""}>${type}</option>`).join("")}</select></div><div class="field"><label for="edit-body">Body</label><textarea id="edit-body" maxlength="5000" required>${esc(post.body)}</textarea></div><button class="btn primary" type="submit">Save changes</button></form>`);
}

async function submitEditPost(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const id = form.dataset.postId;
  setBusy(button);
  try {
    const patch = {
      title: document.querySelector("#edit-title").value.trim(),
      topic_id: Number(document.querySelector("#edit-topic").value),
      post_type: document.querySelector("#edit-type").value,
      body: document.querySelector("#edit-body").value.trim()
    };
    const { error } = await sb.from("posts").update(patch).eq("id", id);
    if (error) throw error;
    closeModal();
    note("Post updated.");
    location.hash = `post/${id}`;
  } catch (error) {
    note(authErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

async function deletePost(postId) {
  if (!state.user) return note("Sign in first.");
  if (!window.confirm("Delete this post? This also removes its comments and votes.")) return;
  try {
    const { error } = await sb.from("posts").delete().eq("id", postId);
    if (error) throw error;
    closeModal();
    note("Post deleted.");
    location.hash = "home";
  } catch (error) {
    note(authErrorMessage(error));
  }
}

async function submitSignIn(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  setBusy(button);
  try {
    const email = document.querySelector("#signin-email").value.trim();
    const password = document.querySelector("#signin-password").value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    note("Signed in.");
    location.hash = "home";
  } catch (error) {
    note(authErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

async function submitSignUp(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const username = document.querySelector("#signup-username").value.trim();
  const email = document.querySelector("#signup-email").value.trim();
  const password = document.querySelector("#signup-password").value;
  const confirm = document.querySelector("#signup-password-2").value;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return note("Choose a valid username.");
  if (password !== confirm) return note("Passwords do not match.");
  setBusy(button);
  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) throw error;
    if (data.session) {
      note("Account created.");
      location.hash = "home";
    } else {
      note("Account created. Check your email to confirm it, then sign in.");
      location.hash = "profile";
    }
  } catch (error) {
    note(authErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

async function signOut() {
  const { error } = await sb.auth.signOut({ scope: "local" });
  if (error) return note(authErrorMessage(error));
  note("Signed out.");
  location.hash = "home";
}

async function rerenderCurrentRoute() {
  await render();
}

async function render() {
  app.innerHTML = `<div class="shell loading">Loading community…</div>`;
  try {
    const hash = currentHash();
    const [route, value] = hash.split("?")[0].split("/");
    const params = new URLSearchParams(hash.split("?")[1] || "");
    if (!state.topics.length) await loadTopics();

    if (route === "home" || !route) {
      const sort = params.get("sort") || "latest";
      await Promise.all([loadStats(), loadPosts({ sort: sort === "top" ? "top" : "latest", type: sort === "questions" ? "Question" : "" })]);
      app.innerHTML = homePage(sort);
    } else if (route === "explore") {
      const query = params.get("q") || "";
      const type = params.get("type") || "";
      await loadPosts({ query, type });
      app.innerHTML = explorePage(query, type);
    } else if (route === "topics") {
      app.innerHTML = topicsPage();
    } else if (route === "topic") {
      const topic = topicBySlug(value);
      if (!topic) app.innerHTML = topicPage(value);
      else {
        await loadPosts({ topicId: topic.id });
        app.innerHTML = topicPage(value);
      }
    } else if (route === "create") {
      app.innerHTML = createPage();
    } else if (route === "profile") {
      app.innerHTML = profilePage();
      if (!state.user) await renderAuthPanel("signin");
    } else if (route === "post") {
      await loadPostDetail(value);
      app.innerHTML = detailPage(state.currentPost);
    } else {
      location.hash = "home";
      return;
    }
  } catch (error) {
    app.innerHTML = shell(`<div class="page"><div class="form"><h2>Couldn't load the community.</h2><p class="muted">${esc(authErrorMessage(error))}</p><button class="btn" type="button" data-retry>Retry</button></div></div>`);
  }
}

function handleClick(event) {
  const target = event.target.closest("button,a");
  if (!target) return;

  const voteId = target.dataset.vote;
  if (voteId) return void toggleVote(voteId);

  const sort = target.dataset.homeSort;
  if (sort) {
    location.hash = sort === "latest" ? "home" : `home?sort=${sort}`;
    return;
  }

  const postMenuId = target.dataset.postMenu;
  if (postMenuId) return void postMenu(postMenuId);

  const commentMenuId = target.dataset.commentMenu;
  if (commentMenuId) {
    const comment = state.comments.find(item => item.id === commentMenuId);
    if (comment) openModal(`<button class="close" type="button" data-close-modal aria-label="Close">×</button><h2>Comment actions</h2><div class="menu-list"><button type="button" data-report-comment="${esc(comment.id)}">Report comment</button></div>`);
    return;
  }

  const reportPostId = target.dataset.reportPost;
  if (reportPostId) return void reportDialog("post", reportPostId);

  const reportCommentId = target.dataset.reportComment;
  if (reportCommentId) return void reportDialog("comment", reportCommentId);

  const blockId = target.dataset.blockUser;
  if (blockId) return void blockUser(blockId);

  const editId = target.dataset.editPost;
  if (editId) {
    const post = state.posts.find(item => item.id === editId) || state.currentPost;
    if (post) editPostDialog(post);
    return;
  }

  const deleteId = target.dataset.deletePost;
  if (deleteId) return void deletePost(deleteId);

  const authTab = target.dataset.authTab;
  if (authTab) return void renderAuthPanel(authTab);

  if (target.dataset.reply) {
    const form = document.querySelector("#comment-form");
    if (!form) return;
    form.dataset.parentId = target.dataset.reply;
    const textarea = document.querySelector("#comment");
    if (textarea) {
      textarea.focus();
      note("Replying to this comment.");
    }
    return;
  }

  if (target.id === "signout") return void signOut();
  if (target.dataset.closeModal !== undefined) return closeModal();
  if (target.dataset.retry !== undefined) return void render();
}

modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

document.addEventListener("click", handleClick);
document.addEventListener("submit", event => {
  if (event.target.id === "create-form") submitPost(event);
  else if (event.target.id === "comment-form") submitComment(event);
  else if (event.target.id === "report-form") submitReport(event);
  else if (event.target.id === "edit-post-form") submitEditPost(event);
  else if (event.target.id === "signin-form") submitSignIn(event);
  else if (event.target.id === "signup-form") submitSignUp(event);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

document.querySelector("#search").addEventListener("click", () => {
  openModal(`<button class="close" type="button" data-close-modal aria-label="Close">×</button><h2>Search community</h2><form id="search-form" class="searchrow"><input id="search-query" placeholder="Search discussions…" maxlength="80" autofocus><button class="btn primary" type="submit">Search</button></form>`);
  document.querySelector("#search-query")?.focus();
});

document.addEventListener("submit", event => {
  if (event.target.id !== "search-form") return;
  event.preventDefault();
  const q = document.querySelector("#search-query").value.trim();
  closeModal();
  location.hash = q ? `explore?q=${encodeURIComponent(q)}` : "explore";
});

sb.auth.getSession().then(({ data }) => {
  state.user = data.session?.user || null;
  render();
}).catch(() => render());

sb.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user || null;
  setTimeout(() => {
    const route = currentHash().split("?")[0];
    if (route === "profile" || route === "create" || route === "home") render();
  }, 0);
});

window.addEventListener("hashchange", () => render());
