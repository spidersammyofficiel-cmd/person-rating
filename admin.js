const { createClient } = window.supabase;
const client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (selector) => document.querySelector(selector);

function setMessage(selector, text, type = "") {
  const el = $(selector);
  el.textContent = text;
  el.className = `form-message ${type}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-MA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function stars(rating) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

async function isAdmin() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return false;
  const { data, error } = await client.rpc("is_admin");
  return !error && data === true;
}

async function showPanelIfAuthorized() {
  const authorized = await isAdmin();
  if (!authorized) {
    await client.auth.signOut();
    $("#loginCard").classList.remove("hidden");
    $("#adminPanel").classList.add("hidden");
    return false;
  }
  $("#loginCard").classList.add("hidden");
  $("#adminPanel").classList.remove("hidden");
  await loadAll();
  return true;
}

async function loadProfile() {
  const { data, error } = await client.from("profiles").select("id,name,image_url").eq("id", 1).single();
  if (error) return setMessage("#profileMessage", "تعذر تحميل بيانات الملف.", "error");
  $("#adminName").value = data.name || "";
  $("#adminImage").value = data.image_url || "";
}

async function loadReviews() {
  const { data, error } = await client.from("reviews").select("id,rating,comment,created_at,is_hidden").order("created_at", { ascending: false });
  const box = $("#adminReviews");
  box.innerHTML = "";
  if (error) {
    box.innerHTML = `<div class="error-box">تعذر تحميل التعليقات. تأكد من تشغيل SQL المحدث ومن إضافة حسابك إلى admins.</div>`;
    return;
  }
  if (!data.length) {
    box.innerHTML = `<div class="empty-state"><div>💬</div><h3>لا توجد تعليقات</h3></div>`;
    return;
  }
  data.forEach((review) => {
    const article = document.createElement("article");
    article.className = `admin-item ${review.is_hidden ? "is-hidden" : ""}`;

    const meta = document.createElement("div");
    meta.className = "admin-item-meta";
    meta.innerHTML = `<strong>${review.is_hidden ? "مخفي" : "منشور"}</strong><span>${formatDate(review.created_at)}</span>`;

    const rating = document.createElement("div");
    rating.className = "comment-stars";
    rating.textContent = stars(review.rating);

    const text = document.createElement("p");
    text.className = "comment-text";
    text.textContent = review.comment;

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const toggle = document.createElement("button");
    toggle.className = "secondary-btn";
    toggle.textContent = review.is_hidden ? "إظهار" : "إخفاء";
    toggle.onclick = () => toggleReview(review.id, !review.is_hidden);

    const remove = document.createElement("button");
    remove.className = "danger-btn";
    remove.textContent = "حذف نهائي";
    remove.onclick = () => deleteReview(review.id);

    actions.append(toggle, remove);
    article.append(meta, rating, text, actions);
    box.appendChild(article);
  });
}

async function loadReports() {
  const { data, error } = await client.from("reports").select("id,review_id,reason,created_at").order("created_at", { ascending: false });
  const box = $("#adminReports");
  box.innerHTML = "";
  if (error) {
    box.innerHTML = `<div class="error-box">تعذر تحميل البلاغات.</div>`;
    return;
  }
  if (!data.length) {
    box.innerHTML = `<div class="empty-state"><div>✓</div><h3>لا توجد بلاغات</h3></div>`;
    return;
  }
  data.forEach((report) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `<div class="admin-item-meta"><strong>تعليق #${report.review_id}</strong><span>${formatDate(report.created_at)}</span></div>`;
    const p = document.createElement("p");
    p.className = "comment-text";
    p.textContent = report.reason;
    item.appendChild(p);
    box.appendChild(item);
  });
}

async function toggleReview(id, hidden) {
  const { error } = await client.from("reviews").update({ is_hidden: hidden }).eq("id", id);
  if (error) {
    alert("تعذر تغيير حالة التعليق. تأكد من صلاحيات المشرف.");
    return;
  }
  await loadReviews();
}

async function deleteReview(id) {
  if (!confirm("هل تريد حذف هذا التعليق نهائيًا؟ لا يمكن التراجع عن هذه العملية.")) return;
  const { error } = await client.from("reviews").delete().eq("id", id);
  if (error) {
    alert("تعذر حذف التعليق.");
    return;
  }
  await Promise.all([loadReviews(), loadReports()]);
}

async function loadAll() {
  await Promise.all([loadProfile(), loadReviews(), loadReports()]);
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("#loginMessage", "جاري تسجيل الدخول...");
  const email = $("#emailInput").value.trim();
  const password = $("#passwordInput").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    setMessage("#loginMessage", "بيانات الدخول غير صحيحة أو لم يتم تفعيل الحساب.", "error");
    return;
  }
  const ok = await showPanelIfAuthorized();
  if (!ok) setMessage("#loginMessage", "تم تسجيل الدخول، لكن هذا الحساب ليس مشرفًا.", "error");
});

$("#logoutBtn").addEventListener("click", async () => {
  await client.auth.signOut();
  location.reload();
});

$("#refreshBtn").addEventListener("click", loadAll);

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#adminName").value.trim();
  const image_url = $("#adminImage").value.trim();
  const { error } = await client.from("profiles").update({ name, image_url }).eq("id", 1);
  if (error) {
    setMessage("#profileMessage", "تعذر حفظ البيانات. تحقق من صلاحيات المشرف.", "error");
    return;
  }
  setMessage("#profileMessage", "تم حفظ بيانات الشخص.", "success");
});

showPanelIfAuthorized();
