const { createClient } = window.supabase;

const client = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

let selectedRating = 0;

const $ = (selector) => document.querySelector(selector);
const starButtons = [...document.querySelectorAll("#starPicker button")];

const ratingLabels = {
  1: "تجربة سيئة جدًا",
  2: "تجربة سيئة",
  3: "تجربة متوسطة",
  4: "تجربة جيدة",
  5: "تجربة ممتازة"
};

function isConfigured() {
  return !window.SUPABASE_URL.includes("YOUR-PROJECT")
    && !window.SUPABASE_ANON_KEY.includes("YOUR_PUBLIC");
}

function showMessage(text, type = "") {
  const box = $("#formMessage");
  box.textContent = text;
  box.className = `form-message ${type}`;
}

function renderStars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function updatePicker() {
  starButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      Number(button.dataset.rating) <= selectedRating
    );
  });

  $("#selectedLabel").textContent =
    selectedRating ? ratingLabels[selectedRating] : "لم تختر تقييمًا بعد";
}

starButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedRating = Number(button.dataset.rating);
    updatePicker();
  });

  button.addEventListener("mouseenter", () => {
    const value = Number(button.dataset.rating);
    starButtons.forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.rating) <= value);
    });
  });
});

$("#starPicker").addEventListener("mouseleave", updatePicker);

$("#commentInput").addEventListener("input", () => {
  $("#charCount").textContent = `${$("#commentInput").value.length} / 500`;
});

async function loadProfile() {
  const { data, error } = await client
    .from("profiles")
    .select("id,name,image_url")
    .eq("id", 1)
    .single();

  if (error) {
    console.error(error);
    $("#personName").textContent = "تعذر تحميل الملف";
    return;
  }

  $("#personName").textContent = data.name;
  $("#personImage").src = data.image_url || "person.svg";
}

async function loadSummary() {
  const { data, error } = await client
    .from("reviews")
    .select("rating");

  if (error) {
    console.error(error);
    return;
  }

  const count = data.length;
  const average = count
    ? data.reduce((sum, item) => sum + item.rating, 0) / count
    : 0;

  $("#averageRating").textContent = average.toFixed(1);
  $("#ratingCount").textContent = count;
  $("#summaryStars").textContent = renderStars(average);
}

function escapeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-MA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

async function loadReviews() {
  const sort = $("#sortSelect").value;

  let query = client
    .from("reviews")
    .select("id,rating,comment,created_at")
    .eq("is_hidden", false);

  if (sort === "highest") {
    query = query.order("rating", { ascending: false })
                 .order("created_at", { ascending: false });
  } else if (sort === "lowest") {
    query = query.order("rating", { ascending: true })
                 .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    $("#commentsList").innerHTML =
      `<div class="error-box">تعذر تحميل التعليقات. تحقق من إعدادات Supabase.</div>`;
    return;
  }

  const list = $("#commentsList");
  list.innerHTML = "";
  $("#emptyState").style.display = data.length ? "none" : "block";

  data.forEach((review) => {
    const article = document.createElement("article");
    article.className = "comment";

    const top = document.createElement("div");
    top.className = "comment-top";

    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = "زائر مجهول";

    const date = document.createElement("span");
    date.className = "comment-date";
    date.textContent = escapeDate(review.created_at);

    top.append(author, date);

    const stars = document.createElement("div");
    stars.className = "comment-stars";
    stars.textContent = renderStars(review.rating);

    const text = document.createElement("p");
    text.className = "comment-text";
    text.textContent = review.comment;

    const report = document.createElement("button");
    report.className = "report-btn";
    report.textContent = "⚑ الإبلاغ عن التعليق";
    report.addEventListener("click", () => reportReview(review.id));

    article.append(top, stars, text, report);
    list.appendChild(article);
  });
}

async function reportReview(reviewId) {
  const reason = prompt("ما سبب الإبلاغ؟ (اختياري)");
  if (reason === null) return;

  const { error } = await client
    .from("reports")
    .insert({
      review_id: reviewId,
      reason: reason.trim().slice(0, 300) || "بلاغ من الزائر"
    });

  if (error) {
    console.error(error);
    alert("تعذر إرسال البلاغ. حاول مرة أخرى.");
    return;
  }

  alert("تم إرسال البلاغ. شكرًا.");
}

$("#submitBtn").addEventListener("click", async () => {
  if (!isConfigured()) {
    showMessage(
      "لم يتم إعداد Supabase بعد. افتح config.js وضع Project URL وPublic/anon key.",
      "error"
    );
    return;
  }

  if (!selectedRating) {
    showMessage("اختر تقييمًا أولًا.", "error");
    return;
  }

  const comment = $("#commentInput").value.trim();

  if (!comment) {
    showMessage("اكتب تعليقًا قبل الإرسال.", "error");
    return;
  }

  const button = $("#submitBtn");
  button.disabled = true;
  button.textContent = "جارٍ النشر...";

  const { error } = await client
    .from("reviews")
    .insert({
      rating: selectedRating,
      comment
    });

  button.disabled = false;
  button.textContent = "إرسال التقييم";

  if (error) {
    console.error(error);
    showMessage(
      "لم يتم نشر التقييم. تحقق من إعدادات Supabase وRLS.",
      "error"
    );
    return;
  }

  selectedRating = 0;
  $("#commentInput").value = "";
  $("#charCount").textContent = "0 / 500";
  updatePicker();
  showMessage("تم نشر تقييمك بنجاح.", "success");

  await Promise.all([loadSummary(), loadReviews()]);
});

$("#sortSelect").addEventListener("change", loadReviews);

$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
});

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
}

async function init() {
  updatePicker();

  if (!isConfigured()) {
    $("#personName").textContent = "إعداد Supabase مطلوب";
    showMessage(
      "افتح config.js وأدخل بيانات Supabase قبل استخدام الموقع.",
      "error"
    );
    return;
  }

  await Promise.all([
    loadProfile(),
    loadSummary(),
    loadReviews()
  ]);
}

init();
