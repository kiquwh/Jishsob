const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || "8820492338:AAEPcZNf6b67O9k9zQb1WiLRzOmkFP8Qr88";
const TELEGRAM_API = "https://api.telegram.org/bot" + BOT_TOKEN;
const OWNER_ID = "8854073031";
const BOT_NAME = "حاج گاسم";
const BOT_USERNAME = "@idVantaHUBbot";
const DEFAULT_CHANNEL = "@Vantahub1792";

const PORT = process.env.PORT || 3000;

// Simple JSON Database file emulation for Cloudflare KV
const DB_FILE = './database.json';
let dbData = { global_config: null, groups: {}, secrets: {} };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Load DB Error:", e);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
  } catch (e) {
    console.error("Save DB Error:", e);
  }
}

loadDB();

const kvMock = {
  get: async (key, options) => {
    if (key === "global_config") return dbData.global_config;
    if (key.startsWith("group:")) return dbData.groups[key];
    if (key.startsWith("secret:")) return dbData.secrets[key];
    if (key.startsWith("await_action:")) return dbData.secrets[key];
    return null;
  },
  put: async (key, val, options) => {
    if (key === "global_config") {
      dbData.global_config = typeof val === 'string' ? JSON.parse(val) : val;
    } else if (key.startsWith("group:")) {
      dbData.groups[key] = typeof val === 'string' ? JSON.parse(val) : val;
    } else {
      dbData.secrets[key] = val;
    }
    saveDB();
  },
  delete: async (key) => {
    if (key.startsWith("group:")) {
      delete dbData.groups[key];
    } else {
      delete dbData.secrets[key];
    }
    saveDB();
  }
};

const DEFAULT_WELCOME = "🌟 به گروه خوش اومدی! 🌟\n" +
"سلام {name} عزیز 👋\n" +
"خیلی خوشحالیم که به جمع ما پیوستی! 🖤\n" +
"📌 قبل از فعالیت، لطفاً قوانین گروه رو مطالعه کن و به اعضای گروه احترام بذار.\n" +
"💬 برای داشتن یه محیط بهتر، از اسپم، تبلیغات و ایجاد مزاحمت خودداری کن.\n" +
"✨ امیدواریم اینجا لحظات خوبی کنار هم داشته باشیم!\n" +
"━━━━━━━━━━━━━━━━━━\n" +
"🤖 مدیریت گروه با:\n" +
BOT_USERNAME + "\n" +
"━━━━━━━━━━━━━━━━━━";

app.get("/setWebhook", async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const webhookUrl = `${protocol}://${host}/`;
  const response = await fetch(TELEGRAM_API + "/setWebhook?url=" + encodeURIComponent(webhookUrl));
  res.json(await response.json());
});

app.get("/deleteWebhook", async (req, res) => {
  const response = await fetch(TELEGRAM_API + "/deleteWebhook?drop_pending_updates=true");
  res.json(await response.json());
});

app.post("/", async (req, res) => {
  try {
    const update = req.body;
    handleUpdate(update, { BOT_KV: kvMock }).catch(err => console.error("Update Error:", err));
  } catch (e) {
    console.error("Body JSON Error:", e);
  }
  res.status(200).send("OK");
});

app.get("/", (req, res) => {
  res.send("Bot is active on Railway!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

async function tgCall(method, payload) {
  try {
    const res = await fetch(TELEGRAM_API + "/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return { ok: false };
  }
}

async function sendMessage(chat_id, text, reply_to_message_id = null, reply_markup = null) {
  const payload = { chat_id, text, parse_mode: "Markdown", disable_web_page_preview: true };
  if (reply_to_message_id) payload.reply_to_message_id = reply_to_message_id;
  if (reply_markup) payload.reply_markup = reply_markup;
  return await tgCall("sendMessage", payload);
}

async function answerCallbackQuery(id, text = "", alert = false) {
  return await tgCall("answerCallbackQuery", { callback_query_id: id, text, show_alert: alert });
}

async function editMessageText(chat_id, message_id, text, reply_markup = null) {
  const payload = { chat_id, message_id, text, parse_mode: "Markdown", disable_web_page_preview: true };
  if (reply_markup) payload.reply_markup = reply_markup;
  return await tgCall("editMessageText", payload);
}

async function checkChannelMember(channel, userId) {
  try {
    const res = await tgCall("getChatMember", { chat_id: channel, user_id: userId });
    if (res.ok && ["creator", "administrator", "member"].includes(res.result.status)) {
      return true;
    }
  } catch(e) {}
  return false;
}

async function getGlobalConfig(env) {
  try {
    if (env && env.BOT_KV) {
      const cfg = await env.BOT_KV.get("global_config", { type: "json" });
      if (cfg) {
        if (!Array.isArray(cfg.bot_admins)) cfg.bot_admins = [OWNER_ID];
        if (!Array.isArray(cfg.private_users)) cfg.private_users = [];
        if (!Array.isArray(cfg.banned_pv)) cfg.banned_pv = [];
        if (!cfg.users_data) cfg.users_data = {};
        if (!cfg.hourly_claims) cfg.hourly_claims = {};
        return cfg;
      }
    }
  } catch (e) {}
  return { is_off: false, off_reason: "", bot_admins: [OWNER_ID], private_users: [], banned_pv: [], users_data: {}, hourly_claims: {} };
}

async function saveGlobalConfig(env, cfg) {
  try {
    if (env && env.BOT_KV) {
      await env.BOT_KV.put("global_config", JSON.stringify(cfg));
    }
  } catch (e) {}
}

function getUserData(cfg, userId) {
  const uId = String(userId);
  if (!cfg.users_data) cfg.users_data = {};
  if (!cfg.users_data[uId]) {
    cfg.users_data[uId] = { coins: (uId === OWNER_ID ? 999999999 : 0), gifts: [], referred_by: null, has_received_ref_bonus: false };
  }
  if (uId === OWNER_ID) {
    cfg.users_data[uId].coins = 999999999;
  }
  if (!Array.isArray(cfg.users_data[uId].gifts)) cfg.users_data[uId].gifts = [];
  if (typeof cfg.users_data[uId].coins !== "number") cfg.users_data[uId].coins = 0;
  if (cfg.users_data[uId].referred_by === undefined) cfg.users_data[uId].referred_by = null;
  if (cfg.users_data[uId].has_received_ref_bonus === undefined) cfg.users_data[uId].has_received_ref_bonus = false;
  return cfg.users_data[uId];
}

const SHOP_ITEMS = [
  { name: "❤️", price: 5000 },
  { name: "😍", price: 8000 },
  { name: "🌹", price: 6000 },
  { name: "💋", price: 10000 },
  { name: "💖", price: 12000 },
  { name: "😘", price: 9000 },
  { name: "👀", price: 4000 },
  { name: "💔", price: 7000 },
  { name: "💞", price: 15000 },
  { name: "💗", price: 14000 },
  { name: "💌", price: 11000 },
  { name: "🤗", price: 8000 }
];

function createNewGroupData(adderId = null) {
  return {
    adder_id: adderId ? String(adderId) : null,
    admins: [],
    members: [],
    locks: { text: false, photo: false, video: false, audio: false, location: false, sticker: false, animation: false, link: false, username: false, forward: false, persian: false, english: false, edit: false, hashtag: false },
    saved_asl: null,
    saved_link: null,
    group_lock_until: null,
    max_warns: 3,
    warn_action: "mute",
    warns: {},
    muted_users: {},
    banned_users: [],
    nicknames: {},
    welcome_text: DEFAULT_WELCOME,
    rules: "",
    req_adds: 0,
    forced_channels: [DEFAULT_CHANNEL],
    user_added_ids: {},
    spam_limit: 0,
    spam_action: { type: "mute", minutes: 5 },
    user_recent_msgs: {},
    filtered_words: {},
    stats: { total: 0, today: 0, date: new Date().toISOString().split('T')[0], user_msg_count: {}, user_names: {} }
  };
}

async function getGroupData(env, chatId) {
  const key = "group:" + chatId;
  try {
    if (env && env.BOT_KV) {
      const data = await env.BOT_KV.get(key, { type: "json" });
      if (data) {
        if (!data.user_added_ids) data.user_added_ids = {};
        if (!data.user_recent_msgs) data.user_recent_msgs = {};
        if (!data.filtered_words) data.filtered_words = {};
        if (!data.forced_channels) data.forced_channels = [DEFAULT_CHANNEL];
        if (!data.spam_action) data.spam_action = { type: "mute", minutes: 5 };
        if (!data.stats) data.stats = { total: 0, today: 0, date: new Date().toISOString().split('T')[0], user_msg_count: {}, user_names: {} };
        if (!data.stats.user_names) data.stats.user_names = {};
        if (!data.stats.user_msg_count) data.stats.user_msg_count = {};
        if (data.rules === undefined) data.rules = "";
        if (!data.locks) data.locks = {};
        if (data.locks.forward === undefined) data.locks.forward = false;
        if (data.locks.persian === undefined) data.locks.persian = false;
        if (data.locks.english === undefined) data.locks.english = false;
        if (data.locks.edit === undefined) data.locks.edit = false;
        if (data.locks.hashtag === undefined) data.locks.hashtag = false;
        if (data.saved_asl === undefined) data.saved_asl = null;
        if (data.saved_link === undefined) data.saved_link = null;
        if (!Array.isArray(data.members)) data.members = [];
        if (!Array.isArray(data.admins)) data.admins = [];
        if (!Array.isArray(data.banned_users)) data.banned_users = [];
        return data;
      }
    }
  } catch (e) {}
  return createNewGroupData();
}

async function saveGroupData(env, chatId, data) {
  try {
    if (env && env.BOT_KV) {
      await env.BOT_KV.put("group:" + chatId, JSON.stringify(data));
    }
  } catch (e) {}
}

async function isAdmin(env, chatId, userId) {
  const uIdStr = String(userId);
  if (uIdStr === OWNER_ID) return true;

  const g = await getGroupData(env, chatId);

  if (g.adder_id && String(g.adder_id) === uIdStr) return true;
  if (g.admins.map(String).includes(uIdStr)) return true;

  const res = await tgCall("getChatMember", { chat_id: chatId, user_id: userId });
  if (res.ok && ["creator", "administrator"].includes(res.result.status)) {
    if (!g.adder_id) {
      g.adder_id = uIdStr;
      await saveGroupData(env, chatId, g);
    }
    return true;
  }
  return false;
}

function getFullDateDetails() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour12: false, hour: "2-digit", minute: "2-digit" });
  let jalaliDate = "-", hijriDate = "-", gregorianDate = "-";
  
  try {
    jalaliDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    hijriDate = new Intl.DateTimeFormat("fa-IR-u-ca-islamic-uma", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    gregorianDate = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  } catch(e) {}

  return { time: timeStr, jalali: jalaliDate, hijri: hijriDate, gregorian: gregorianDate };
}

function getHelpKeyboard(category = "main") {
  if (category === "main") {
    return {
      inline_keyboard: [
        [{ text: "🔒 قفل‌ها و اسپم", callback_data: "help_locks" }, { text: "⚠️ مجازات و اخطار", callback_data: "help_punish" }],
        [{ text: "🏷 لقب و تگ", callback_data: "help_tags" }, { text: "⚙️ تنظیمات و قوانین", callback_data: "help_settings" }],
        [{ text: "🎲 سرگرمی و فیلتر", callback_data: "help_fun" }, { text: "🛒 خرید و محصولات", callback_data: "help_shop" }]
      ]
    };
  }
  return { inline_keyboard: [[{ text: "🔙 بازگشت به منوی اصلی", callback_data: "help_main" }]] };
}

function getHelpText(category) {
  switch (category) {
    case "locks": return "🔒 **دستورات قفل و اسپم:**\n\n▫️ `قفل گروه` | `قفل گروه [ساعت]` | `بازکردن گروه`\n▫️ `تنظیم اسپم [تعداد]` | `تنظیم اسپم غیرفعال`\n▫️ `تنظیم مجازات اسپم [سکوت/بن/اخطار] [دقیقه]`\n▫️ `قفل عکس` | `قفل گیف` | `قفل استیکر` | `قفل مکان`\n▫️ `قفل فیلم` | `قفل اهنگ` | `قفل لینک` | `قفل ایدی`\n▫️ `قفل فروارد` | `قفل فارسی` | `قفل انگلیسی` | `قفل ویرایش` | `قفل هشتگ`";
    case "punish": return "⚠️ **دستورات اخطار، سنجاق و مجازات:**\n\n▫️ `پین` | `انپین` | `اخطار` | `حذف اخطار`\n▫️ `تنظیم حداکثر اخطار [تعداد]`\n▫️ `تنظیم مجازات اخطار [بن/سکوت]`\n▫️ `سکوت` | `سکوت [دقیقه]` | `حذف سکوت` | `لیست سکوت`\n▫️ `بن` | `بن +` | `سیک` | `حذف بن` | `لیست بن` | `حذف پیام [تعداد]`";
    case "tags": return "🏷 **دستورات لقب، آمار و تگ:**\n\n▫️ `تنظیم لقب [اسم]` | `حذف لقب` | `لقب`\n▫️ `تگ کل` | `تگ مدیران` | `تگ کاربران` | `تگ [متن]`\n▫️ `امار کل` | `امار امروز` | `امار` | `پنل کاربر`";
    case "settings": return "⚙️ **تنظیمات مدیریت و دعوت:**\n\n▫️ `تنظیم قوانین [متن]` | `قوانین`\n▫️ `اد اجباری [تعداد]` | `اد اجباری غیرفعال`\n▫️ `تنظیم عضویت اجباری [يوزر_كانال]`\n▫️ `حذف عضویت اجباری [يوزر_كانال]` | `لیست عضویت اجباری`\n▫️ `تنظیم خوشامد [متن]`\n▫️ `تنظیم مدیر` | `حذف مدیر` | `لیست مدیرها`\n▫️ `ثبت اصل` | `حذف اصل` | `ثبت لینک اینجا` | `حذف لینک اینجا` | `لینک ها`";
    case "fun": return "🎲 **دستورات سرگرمی و فیلترینگ:**\n\n▫️ `تاریخ` | `فال` | `تاس` | `سکه` | `شانس` | `فونت [متن]`\n▫️ `مخفی [متن]` (ارسال و حذف آنی پیام)\n▫️ `پیام [username@] [متن]` (پیام مخفی به کاربر)\n▫️ `تبدیل استیکر به عکس` (ریپلای روی استیکر)\n▫️ `[عدد 1] [عملگر +-*/] [عدد 2]` (ماشین حساب)\n▫️ `فیلتر [کلمه]` | `حذف فیلتر [کلمه]` | `لیست فیلتر`";
    case "shop": return "🛒 **بخش خرید، محصولات و اقتصادی:**\n\n▫️ `محصولات` یا `فروشگاه`\n▫️ `موجودی`\n▫️ `پروفایل`\n▫️ `خرید [ایموجی]` (مثال: `خرید ❤️`)\n▫️ `انتقال [ایموجی]` (مثال: `انتقال [آیدی_عددی] [ایموجی]`)\n▫️ `انتقال [آیدی_عددی] [تعداد_سکه]` (انتقال سکه)\n▫️ `حذف سکه [آیدی_عددی] [تعداد]` (مخصوص مالک)\n▫️ `حذف هدیه [آیدی_عددی] [ایموجی]` (مخصوص مالک)\n▫️ `کم کردن سکه [آیدی_عددی] [تعداد]` (مخصوص مالک)\n▫️ `پاک کردن هدایا`\n▫️ `گردونه` (هزینه ورودی ۱۰۰ سکه)";
    default: return "📚 **به پنل راهنمای مدیریت گروه خوش آمدید.**\n\nیک بخش را انتخاب کنید:";
  }
}

function getPrivateKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ افزودن به گپ" }, { text: "🎧 پشتیبانی" }],
      [{ text: "👥 دعوت دوستان" }, { text: "📢 کانال ما" }]
    ],
    resize_keyboard: true
  };
}

function getMultiChannelKeyboard(channels) {
  const keyboard = [];
  let index = 1;
  for (const ch of channels) {
    const cleanCh = ch.replace("@", "");
    keyboard.push([{ text: `📢 کانال ${index}`, url: `https://t.me/${cleanCh}` }]);
    index++;
  }
  keyboard.push([{ text: "🔄 بررسی", callback_data: "check_multi_sub" }]);
  return { inline_keyboard: keyboard };
}

function getAdminPanelKeyboard(isOff, userId) {
  const keyboard = [
    [{ text: isOff ? "🟢 روشن کردن ربات" : "🔴 خاموش کردن ربات", callback_data: "toggle_bot_state" }],
    [{ text: "➕ افزودن مدیر", callback_data: "add_admin_prompt" }, { text: "➖ حذف مدیر", callback_data: "rem_admin_prompt" }],
    [{ text: "👥 لیست کاربران", callback_data: "list_users" }, { text: "🚫 بن کاربر", callback_data: "ban_user_prompt" }],
    [{ text: "🟢 آن‌بن کاربر", callback_data: "unban_user_prompt" }, { text: "📢 پیام همگانی", callback_data: "broadcast_prompt" }],
    [{ text: "🪙 دادن سکه به همه", callback_data: "give_coins_all_prompt" }]
  ];

  if (userId === OWNER_ID) {
    keyboard.push([{ text: "⚙️ مدیریت (مخصوص مالک)", callback_data: "owner_management" }]);
  }

  keyboard.push([{ text: "🔙 بازگشت", callback_data: "pv_main_menu" }]);
  return { inline_keyboard: keyboard };
}

async function handleUpdate(update, env) {
  try {
    let cfg = await getGlobalConfig(env);

    if (update.my_chat_member) {
      const mcm = update.my_chat_member;
      const chatId = mcm.chat.id;
      const newStatus = mcm.new_chat_member.status;
      if (["administrator"].includes(newStatus)) {
        const defaultAdminMsg = "🤖 *" + BOT_NAME + "*\n✦ سیستم مدیریت فعال شد ✦\n\nسلام مدیر!\nبا موفقیت به جمع مدیران این گروه اضافه شدم. 😎\nربات مدیریت گروه: " + BOT_USERNAME;
        await sendMessage(chatId, defaultAdminMsg);
      }
      return;
    }

    if (update.callback_query) {
      const cb = update.callback_query;
      const userId = String(cb.from.id);
      const data = cb.data;
      const botAdmins = Array.isArray(cfg.bot_admins) ? cfg.bot_admins.map(String) : [OWNER_ID];
      const isOwnerOrAdmin = userId === OWNER_ID || botAdmins.includes(userId);

      if (data === "check_multi_sub") {
        const chatId = cb.message.chat.id;
        const g = await getGroupData(env, chatId);
        const channels = g.forced_channels || [DEFAULT_CHANNEL];
        
        let allJoined = true;
        for (const ch of channels) {
          const joined = await checkChannelMember(ch, userId);
          if (!joined) {
            allJoined = false;
            break;
          }
        }

        if (allJoined) {
          await answerCallbackQuery(cb.id, "عضویت در تمامی کانال‌ها تایید شد!", true);
          return await tgCall("deleteMessage", { chat_id: chatId, message_id: cb.message.message_id });
        } else {
          await answerCallbackQuery(cb.id, "هنوز در همه کانال‌ها عضو نیستید!", true);
        }
        return;
      }

      if (data.startsWith("secret_")) {
        const parts = data.split("_");
        const targetUsername = parts[1].toLowerCase().replace("@", "");
        const secretKey = parts.slice(2).join("_");

        const senderUsername = cb.from.username ? cb.from.username.toLowerCase() : "";
        if (senderUsername !== targetUsername && userId !== targetUsername) {
          return await answerCallbackQuery(cb.id, "این پیام مخفی برای شما نیست!", true);
        }

        let secretContent = "پیام یافت نشد یا منقضی شده است.";
        if (env && env.BOT_KV) {
          const val = await env.BOT_KV.get("secret:" + secretKey);
          if (val) secretContent = val;
        }
        return await answerCallbackQuery(cb.id, secretContent, true);
      }

      if (data.startsWith("ans_pv_")) {
        if (userId !== OWNER_ID) return await answerCallbackQuery(cb.id, "فقط مالک ربات می‌تواند پاسخ دهد.", true);
        const targetUserId = data.replace("ans_pv_", "");
        if (env && env.BOT_KV) {
          await env.BOT_KV.put("await_action:" + userId, "await_support_reply:" + targetUserId);
        }
        await editMessageText(cb.message.chat.id, cb.message.message_id, cb.message.text + "\n\n✍️ **لطفاً پاسخ خود را به این کاربر بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "pv_main_menu") {
        const msgText = "✨ **ربات فعال است.**\n\nآن را در گروه اضافه کرده و ادمین کنید.";
        await editMessageText(cb.message.chat.id, cb.message.message_id, msgText);
        return await answerCallbackQuery(cb.id);
      }

      if (data === "admin_panel") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "شما دسترسی به این بخش را ندارید.", true);
        const panelText = "⚙️ **پنل مدیریت ربات " + BOT_NAME + "**\n\nوضعیت فعلی ربات: " + (cfg.is_off ? "🔴 خاموش" : "🟢 روشن") + "\nتعداد ادمین‌ها: " + (cfg.bot_admins ? cfg.bot_admins.length : 1) + "\nتعداد کاربران ثبت‌شده: " + (cfg.private_users ? cfg.private_users.length : 0);
        await editMessageText(cb.message.chat.id, cb.message.message_id, panelText, getAdminPanelKeyboard(cfg.is_off, userId));
        return await answerCallbackQuery(cb.id);
      }

      if (data === "owner_management") {
        if (userId !== OWNER_ID) return await answerCallbackQuery(cb.id, "فقط مالک ربات به این بخش دسترسی دارد.", true);
        const pUsers = cfg.private_users || [];
        const bUsers = cfg.banned_pv || [];
        let listMsg = "👑 **بخش مدیریت اختصاصی مالک (" + BOT_NAME + "):**\n\nکل کاربران ثبت‌شده: " + pUsers.length + "\nکاربران بن‌شده: " + bUsers.length + "\n\n";
        
        pUsers.slice(0, 25).forEach((u, i) => {
          const isBanned = bUsers.includes(String(u));
          listMsg += (i + 1) + ". آیدی عددی: `" + u + "` | [لینک](tg://user?id=" + u + ") - " + (isBanned ? "🔴 بن" : "🟢 فعال") + "\n";
        });

        listMsg += "\nبرای بن کردن یا آن‌بن کردن کاربر از دکمه‌های پنل اصلی یا دستورات استفاده کنید.";
        const ownerMarkup = {
          inline_keyboard: [
            [{ text: "🚫 بن کاربر", callback_data: "ban_user_prompt" }, { text: "🟢 آن‌بن کاربر", callback_data: "unban_user_prompt" }],
            [{ text: "🪙 دادن سکه به همه", callback_data: "give_coins_all_prompt" }],
            [{ text: "🔙 بازگشت به پنل مدیریت", callback_data: "admin_panel" }]
          ]
        };
        await editMessageText(cb.message.chat.id, cb.message.message_id, listMsg, ownerMarkup);
        return await answerCallbackQuery(cb.id);
      }

      if (data === "give_coins_all_prompt") {
        if (userId !== OWNER_ID) return await answerCallbackQuery(cb.id, "فقط مالک ربات می‌تواند به همه سکه بدهد.", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_give_coins_all");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "🪙 **لطفاً تعداد سکه‌ای که می‌خواهید به همه کاربران اضافه شود را وارد کنید:**\n(فقط عدد بفرستید)");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "toggle_bot_state") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (cfg.is_off) {
          cfg.is_off = false;
          cfg.off_reason = "";
          await saveGlobalConfig(env, cfg);
          
          const users = cfg.private_users || [];
          const activeMsg = "🟢 **ربات با موفقیت فعال شد!** 🎉\n" +
            "🤖 ربات هم‌اکنون آنلاین و آماده استفاده است.\n" +
            "✨ تمامی قابلیت‌ها در دسترس هستند و می‌تونید مثل همیشه از ربات استفاده کنید.\n" +
            "❤️ ممنون از صبر و همراهی شما\n" +
            "🔥 منتظر آپدیت‌ها و قابلیت‌های جدید " + BOT_NAME + " باشید!\n" +
            "👑 مدیریت " + BOT_NAME;

          for (const u of users) {
            await sendMessage(u, activeMsg).catch(() => {});
          }

          await editMessageText(cb.message.chat.id, cb.message.message_id, "🟢 **ربات با موفقیت روشن شد و پیام اطلاع‌رسانی برای کاربران ارسال گردید.**", getAdminPanelKeyboard(false, userId));
          return await answerCallbackQuery(cb.id, "ربات روشن شد.");
        } else {
          if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_off_reason");
          await editMessageText(cb.message.chat.id, cb.message.message_id, "📝 **لطفاً دلیل خاموش شدن ربات را ارسال کنید:**");
          return await answerCallbackQuery(cb.id);
        }
      }

      if (data === "add_admin_prompt") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_add_admin");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "👤 **آیدی عددی کاربر مورد نظر برای افزودن به عنوان مدیر ربات را بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "rem_admin_prompt") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_rem_admin");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "👤 **آیدی عددی مدیر مورد نظر را برای حذف بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "list_users") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        const pUsers = cfg.private_users || [];
        const bUsers = cfg.banned_pv || [];
        let listMsg = "📊 **لیست کامل کاربران ربات:**\n\nکل اعضا: " + pUsers.length + "\nکاربران بن‌شده: " + bUsers.length + "\n\n";
        pUsers.slice(0, 30).forEach((u, i) => {
          const isBanned = bUsers.includes(String(u));
          listMsg += (i + 1) + ". آیدی عددی: `" + u + "` | [لینک کاربر](tg://user?id=" + u + ") - " + (isBanned ? "🔴 بن" : "🟢 فعال") + "\n";
        });
        await editMessageText(cb.message.chat.id, cb.message.message_id, listMsg, getAdminPanelKeyboard(cfg.is_off, userId));
        return await answerCallbackQuery(cb.id);
      }

      if (data === "ban_user_prompt") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_ban_user");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "🚫 **آیدی عددی کاربر مورد نظر را جهت بن بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "unban_user_prompt") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_unban_user");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "🟢 **آیدی عددی کاربر مورد نظر را جهت آن‌بن بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "broadcast_prompt") {
        if (!isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_broadcast");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "📢 **متن یا پیام همگانی خود را بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data.startsWith("help_")) {
        const chatId = cb.message.chat.id;
        if (!(await isAdmin(env, chatId, userId))) return await answerCallbackQuery(cb.id, "شما دسترسی مدیریت ندارید.", true);
        const cat = data.replace("help_", "");
        await editMessageText(chatId, cb.message.message_id, getHelpText(cat), getHelpKeyboard(cat));
        return await answerCallbackQuery(cb.id);
      }

      if (data === "show_rules") {
        const chatId = cb.message.chat.id;
        const g = await getGroupData(env, chatId);
        const rulesText = (g.rules && g.rules.trim() !== "") ? g.rules : "قوانینی ثبت نشده است.";
        return await answerCallbackQuery(cb.id, rulesText, true);
      }

      if (data === "profile_balance") {
        const uData = getUserData(cfg, userId);
        await saveGlobalConfig(env, cfg);
        const displayCoins = (userId === OWNER_ID) ? "♾ (بینهایت)" : uData.coins;
        return await answerCallbackQuery(cb.id, "موجودی سکه شما: " + displayCoins, true);
      }

      if (data === "profile_gifts") {
        const uData = getUserData(cfg, userId);
        await saveGlobalConfig(env, cfg);
        
        let totalVal = 0;
        uData.gifts.forEach(giftName => {
          const foundItem = SHOP_ITEMS.find(i => i.name === giftName);
          if (foundItem) totalVal += foundItem.price;
        });

        let giftsList = "";
        if (uData.gifts.length > 0) {
          uData.gifts.forEach(gift => {
            giftsList += `\n${gift} (فرستنده/مالک: [${userId}](tg://user?id=${userId}))`;
          });
        } else {
          giftsList = "\nندارد";
        }

        const fullGiftsText = `🎁 هدایای شما:${giftsList}\n\n💎 ارزش کل: ${totalVal} سکه`;
        await answerCallbackQuery(cb.id);
        return await editMessageText(cb.message.chat.id, cb.message.message_id, fullGiftsText, {
          inline_keyboard: [[{ text: "🔙 بازگشت به پروفایل", callback_data: "profile_back" }]]
        });
      }

      if (data === "profile_back") {
        const uData = getUserData(cfg, userId);
        await saveGlobalConfig(env, cfg);
        const displayCoins = (userId === OWNER_ID) ? "♾ (بینهایت)" : uData.coins;
        const profileText = "👤 پروفایل شما:\n\n" +
          "▫️ نام: " + cb.from.first_name + "\n" +
          "▫️ آیدی عددی: `" + userId + "`\n" +
          "▫️ موجودی سکه: " + displayCoins + "\n" +
          "▫️ هدایا: (برای مشاهده روی دکمه هدایا بزنید)";
        
        const profileMarkup = {
          inline_keyboard: [
            [
              { text: "🪙 موجودی", callback_data: "profile_balance" },
              { text: "🎁 هدایا", callback_data: "profile_gifts" }
            ],
            [
              { text: "🌐 مشاهده هدایای دیگران", callback_data: "show_all_gifts" }
            ]
          ]
        };
        await answerCallbackQuery(cb.id);
        return await editMessageText(cb.message.chat.id, cb.message.message_id, profileText, profileMarkup);
      }

      if (data === "show_shop_items") {
        let shopText = "🛒 **فروشگاه محصولات و هدایای ربات:**\n\n";
        SHOP_ITEMS.forEach((item) => {
          shopText += `${item.name} - قیمت: \`${item.price}\` سکه\n`;
        });
        shopText += "\nبرای خرید بنویسید:\n`خرید [ایموجی]`\nمثال: `خرید ❤️`";
        await editMessageText(cb.message.chat.id, cb.message.message_id, shopText);
        return await answerCallbackQuery(cb.id);
      }

      if (data === "show_all_gifts") {
        let allGiftsText = "🎁 **لیست هدایای تمامی کاربران:**\n\n";
        let foundAny = false;
        const usersData = cfg.users_data || {};
        for (const [uId, uObj] of Object.entries(usersData)) {
          if (uObj.gifts && uObj.gifts.length > 0) {
            foundAny = true;
            let totalVal = 0;
            allGiftsText += `👤 کاربر: [${uId}](tg://user?id=${uId})\n`;
            uObj.gifts.forEach(gift => {
              const foundItem = SHOP_ITEMS.find(i => i.name === gift);
              if (foundItem) totalVal += foundItem.price;
              allGiftsText += `  ${gift} (فرستنده/مالک: [${uId}](tg://user?id=${uId}))\n`;
            });
            allGiftsText += `  💎 ارزش کل: ${totalVal} سکه\n\n`;
          }
        }
        if (!foundAny) {
          allGiftsText += "هیچ هدیه‌ای در سیستم ثبت نشده است.";
        }
        await editMessageText(cb.message.chat.id, cb.message.message_id, allGiftsText, {
          inline_keyboard: [[{ text: "🔙 بازگشت به پروفایل", callback_data: "profile_back" }]]
        });
        return await answerCallbackQuery(cb.id);
      }

      return;
    }

    if (update.edited_message) {
      const edMsg = update.edited_message;
      const chatId = edMsg.chat.id;
      const userId = String(edMsg.from.id);
      const g = await getGroupData(env, chatId);
      const userIsAdmin = await isAdmin(env, chatId, userId);

      if (!userIsAdmin && g.locks && g.locks.edit) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: edMsg.message_id });
        const editLockText = `🔒 قفل ویرایش فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل ویرایش شدن حذف شد.\n🛡️ قابلیت قفل ویرایش برای حفظ نظم و امنیت فعال است؛ بنابراین در صورت ویرایش پیام، پیام به‌صورت خودکار حذف خواهد شد.\n💡 لطفاً پیام خود را قبل از ارسال بررسی کنید.`;
        await sendMessage(chatId, editLockText);
      }
      return;
    }

    if (!update.message) return;
    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const text = msg.text ? msg.text.trim() : (msg.caption ? msg.caption.trim() : "");
    const botAdmins = Array.isArray(cfg.bot_admins) ? cfg.bot_admins.map(String) : [OWNER_ID];
    const isOwnerOrAdmin = userId === OWNER_ID || botAdmins.includes(userId);

    if (cfg.is_off && userId !== OWNER_ID) {
      if (msg.chat.type === "private") {
        const offMsg = "🔴 ربات در حال حاضر خاموش است\n" +
          (cfg.off_reason ? cfg.off_reason + "\n" : "") +
          "👑 مدیریت " + BOT_NAME;
        return await sendMessage(chatId, offMsg);
      }
      return;
    }

    if (msg.chat.type === "private") {
      if (!cfg.private_users) cfg.private_users = [];
      if (!cfg.private_users.includes(userId)) {
        cfg.private_users.push(userId);
        await saveGlobalConfig(env, cfg);
      }

      if (cfg.banned_pv && cfg.banned_pv.includes(userId)) {
        return await sendMessage(chatId, "🚫 شما از استفاده از این ربات مسدود شده‌اید.");
      }

      let currentAction = null;
      if (env && env.BOT_KV) {
        currentAction = await env.BOT_KV.get("await_action:" + userId);
      }

      if (currentAction && isOwnerOrAdmin) {
        if (env && env.BOT_KV) await env.BOT_KV.delete("await_action:" + userId);

        if (currentAction === "await_off_reason") {
          cfg.is_off = true;
          cfg.off_reason = text;
          await saveGlobalConfig(env, cfg);

          const users = cfg.private_users || [];
          const offMsgForUser = "🔴 ربات در حال حاضر خاموش است\n" + text + "\n👑 مدیریت " + BOT_NAME;
          for (const u of users) {
            if (u !== OWNER_ID) {
              await sendMessage(u, offMsgForUser).catch(() => {});
            }
          }

          return await sendMessage(chatId, "🔴 **ربات خاموش شد و پیام اطلاعیه به تمام کاربران ارسال گردید.**", null, getPrivateKeyboard());
        }

        if (currentAction === "await_give_coins_all") {
          const coinAmount = parseInt(text);
          if (isNaN(coinAmount) || coinAmount <= 0) {
            return await sendMessage(chatId, "❌ مقدار وارد شده نامعتبر است. لطفاً عدد صحیح بفرستید.", null, getPrivateKeyboard());
          }
          const users = cfg.private_users || [];
          for (const u of users) {
            let uData = getUserData(cfg, u);
            if (u !== OWNER_ID) {
              uData.coins += coinAmount;
            }
            
            const giftMsgToUser = `🎁 هدیه ویژه برای شما! 🪙\n` +
              `سلام همراه عزیز ❤️\n` +
              `امروز یک پاداش ویژه از طرف ${BOT_NAME} برای شما در نظر گرفته شده! 🎉\n` +
              `سکه‌های هدیه شما با موفقیت به حسابتون اضافه شد.      تعداد سکه های واریز شده = ${coinAmount}\n` +
              `💎 وارد ربات شوید و موجودی سکه‌هاتون رو بررسی کنید!\n` +
              `🔥 منتظر جوایز و قابلیت‌های بیشتر باشید...\n` +
              `👑 مدیریت ${BOT_NAME}`;

            await sendMessage(u, giftMsgToUser).catch(() => {});
          }
          await saveGlobalConfig(env, cfg);
          return await sendMessage(chatId, `✅ تعداد **${coinAmount}** سکه با موفقیت به همه کاربران ربات اضافه شد.`, null, getPrivateKeyboard());
        }

        if (currentAction === "await_add_admin") {
          if (!cfg.bot_admins) cfg.bot_admins = [OWNER_ID];
          if (!cfg.bot_admins.includes(text)) cfg.bot_admins.push(text);
          await saveGlobalConfig(env, cfg);
          return await sendMessage(chatId, "✅ کاربر `" + text + "` با موفقیت به ادمین‌های ربات اضافه شد.", null, getPrivateKeyboard());
        }

        if (currentAction === "await_rem_admin") {
          if (text === OWNER_ID) return await sendMessage(chatId, "❌ امکان حذف مالک اصلی ربات وجود ندارد.", null, getPrivateKeyboard());
          cfg.bot_admins = (cfg.bot_admins || []).filter(a => String(a) !== text);
          await saveGlobalConfig(env, cfg);
          return await sendMessage(chatId, "✅ کاربر `" + text + "` از لیست مدیران ربات حذف شد.", null, getPrivateKeyboard());
        }

        if (currentAction === "await_ban_user") {
          if (!cfg.banned_pv) cfg.banned_pv = [];
          if (!cfg.banned_pv.includes(text)) cfg.banned_pv.push(text);
          await saveGlobalConfig(env, cfg);
          await sendMessage(text, "🔴 **شما توسط مدیریت از ربات بن شدید.**").catch(() => {});
          return await sendMessage(chatId, "✅ کاربر `" + text + "` بن شد.", null, getPrivateKeyboard());
        }

        if (currentAction === "await_unban_user") {
          cfg.banned_pv = (cfg.banned_pv || []).filter(u => String(u) !== text);
          await saveGlobalConfig(env, cfg);
          await sendMessage(text, "🟢 **حساب شما در ربات آن‌بن شد.**").catch(() => {});
          return await sendMessage(chatId, "✅ کاربر `" + text + "` آن‌بن شد.", null, getPrivateKeyboard());
        }

        if (currentAction === "await_broadcast") {
          const users = cfg.private_users || [];
          let count = 0;
          const broadMsg = `👑 پیام از مالک ${BOT_NAME}\n\n${text}\n\nممنون که کنارمون هستید ❤️\n— مدیریت ${BOT_NAME}`;
          for (const u of users) {
            const r = await sendMessage(u, broadMsg);
            if (r.ok) count++;
          }
          return await sendMessage(chatId, "✅ پیام همگانی با موفقیت برای **" + count + "** کاربر ارسال شد.", null, getPrivateKeyboard());
        }

        if (currentAction.startsWith("await_support_reply:")) {
          const targetUserId = currentAction.replace("await_support_reply:", "");
          const replyMarkup = {
            inline_keyboard: [[{ text: "✍️ جواب دادن", callback_data: "ans_pv_" + userId }]]
          };
          const sentRes = await sendMessage(targetUserId, `💬 **پاسخ پشتیبانی (مالک):**\n\n${text}`, null, replyMarkup);
          if (sentRes.ok) {
            return await sendMessage(chatId, `✅ پاسخ شما با موفقیت برای کاربر \`${targetUserId}\` ارسال شد.`, null, getPrivateKeyboard());
          } else {
            return await sendMessage(chatId, `❌ خطا در ارسال پاسخ به کاربر.`, null, getPrivateKeyboard());
          }
        }
      }

      if (currentAction && currentAction === "await_support_msg") {
        if (env && env.BOT_KV) await env.BOT_KV.delete("await_action:" + userId);
        const replyMarkup = {
          inline_keyboard: [[{ text: "✍️ جواب دادن", callback_data: "ans_pv_" + userId }]]
        };
        const supportForwardText = `📩 **پیام جدید از کاربر:**\n▫️ آیدی عددی: \`${userId}\`\n▫️ لینک پروفایل: [کاربر](tg://user?id=${userId})\n\n**متن پیام:**\n${text}`;
        const ownerRes = await sendMessage(OWNER_ID, supportForwardText, null, replyMarkup);
        if (ownerRes.ok) {
          return await sendMessage(chatId, "✅ پیام شما با موفقیت برای مالک ربات ارسال شد. به زودی پاسخ داده خواهد شد.", null, getPrivateKeyboard());
        } else {
          return await sendMessage(chatId, "❌ خطا در ارسال پیام به پشتیبانی.", null, getPrivateKeyboard());
        }
      }

      if (text === "/admin") {
        if (userId !== OWNER_ID) {
          return await sendMessage(chatId, "❌ این دستور فقط مخصوص مالک ربات است.", msg.message_id);
        }
        const pUsers = cfg.private_users || [];
        const bUsers = cfg.banned_pv || [];
        let listMsg = "👑 **مدیریت اختصاصی مالک (" + BOT_NAME + "):**\n\nکل کاربران: " + pUsers.length + "\nبن‌شده‌ها: " + bUsers.length + "\n\n";
        
        pUsers.slice(0, 20).forEach((u, i) => {
          const isBanned = bUsers.includes(String(u));
          listMsg += (i + 1) + ". آیدی عددی: `" + u + "` | آیدی: [لینک](tg://user?id=" + u + ") - " + (isBanned ? "🔴 بن" : "🟢 فعال") + "\n";
        });

        const ownerPanelMarkup = {
          inline_keyboard: [
            [{ text: "🚫 بن کاربر", callback_data: "ban_user_prompt" }, { text: "🟢 آن‌بن کاربر", callback_data: "unban_user_prompt" }],
            [{ text: "🪙 دادن سکه به همه", callback_data: "give_coins_all_prompt" }],
            [{ text: "⚙️ پنل اصلی ادمین", callback_data: "admin_panel" }]
          ]
        };
        return await sendMessage(chatId, listMsg, msg.message_id, ownerPanelMarkup);
      }

      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        if (parts.length > 1) {
          const refParam = parts[1];
          if (refParam.startsWith("ref_")) {
            const inviterId = refParam.replace("ref_", "");
            if (inviterId !== userId) {
              let uData = getUserData(cfg, userId);
              if (!uData.referred_by && !uData.has_received_ref_bonus) {
                uData.referred_by = inviterId;
                uData.has_received_ref_bonus = true;
                uData.coins += 1000;

                let inviterData = getUserData(cfg, inviterId);
                inviterData.coins += 3000;

                await saveGlobalConfig(env, cfg);

                await sendMessage(inviterId, `🎁 یک نفر با لینک دعوت شما وارد ربات شد!\n💰 **3,000 سکه** به موجودی شما اضافه شد.\n🪙 موجودی جدید: ${inviterData.coins}`).catch(() => {});
                await sendMessage(userId, `🎁 به دلیل ورود با لینک دعوت، **1,000 سکه** به عنوان هدیه به حساب شما واریز شد!`);
              }
            }
          }
        }

        if (text === "panel" || text === "پنل") {
          if (isOwnerOrAdmin) {
            const panelText = "⚙️ **پنل مدیریت ربات " + BOT_NAME + "**\n\nوضعیت فعلی ربات: " + (cfg.is_off ? "🔴 خاموش" : "🟢 روشن");
            return await sendMessage(chatId, panelText, msg.message_id, getAdminPanelKeyboard(cfg.is_off, userId));
          }
        }

        const startMsg = "سلام 👋🏻 به " + BOT_NAME + " خوش اومدی 🖤\n" +
        "🤖 من یک ربات مدیریت گروه قدرتمند هستم و می‌تونم به مدیریت بهتر و امن‌تر گروهت کمک کنم.\n" +
        "📌 برای استفاده از امکانات ربات، منو به گروهت اضافه کن و دسترسی‌های لازم رو بده.\n" +
        "💬 برای ارتباط با پشتیبانی یا دریافت راهنمایی، از دکمه پشتیبانی استفاده کن.\n" +
        "➕ برای اضافه کردن ربات به گروه، روی افزودن به گپ بزن.\n" +
        "🔗 آیدی ربات: " + BOT_USERNAME;
        
        return await sendMessage(chatId, startMsg, msg.message_id, getPrivateKeyboard());
      }

      if (text === "🎧 پشتیبانی") {
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_support_msg");
        return await sendMessage(chatId, "✍️ لطفاً پیام یا سوال خود را برای ارسال به مالک ربات بفرستید:", msg.message_id, getPrivateKeyboard());
      }

      if (text === "👥 دعوت دوستان") {
        const refLink = `https://t.me/${BOT_USERNAME.replace("@", "")}?start=ref_${userId}`;
        const refText = `👥 **سیستم دعوت دوستان (رِفرال):**\n\nبا ارسال لینک زیر به دوستانتان، هر کاربری که با لینک شما وارد ربات شود:\n▫️ **3,000 سکه** به خود شما تعلق می‌گیرد.\n▫️ **1,000 سکه** به عنوان هدیه به دوستتان داده می‌شود.\n\n🔗 لینک اختصاصی دعوت شما:\n\`${refLink}\``;
        return await sendMessage(chatId, refText, msg.message_id, getPrivateKeyboard());
      }

      if (text === "📢 کانال ما") {
        return await sendMessage(chatId, "📢 **کانال رسمی ربات:**\n" + DEFAULT_CHANNEL, msg.message_id, getPrivateKeyboard());
      }

      if (text === "➕ افزودن به گپ") {
        const botCleanUsername = BOT_USERNAME.replace("@", "");
        return await sendMessage(chatId, "➕ **جهت افزودن ربات به گروه روی لینک زیر کلیک کنید:**\nhttps://t.me/" + botCleanUsername + "?startgroup=true", msg.message_id, getPrivateKeyboard());
      }

      return;
    }

    let g = await getGroupData(env, chatId);

    if (text.startsWith("/start")) {
      const res = await tgCall("getChatMember", { chat_id: chatId, user_id: userId });
      if (res.ok && ["creator", "administrator"].includes(res.result.status)) {
        g.adder_id = String(userId);
        await saveGroupData(env, chatId, g);
        const rulesBtn = { inline_keyboard: [[{ text: "📜 قوانین گروه", callback_data: "show_rules" }]] };
        return await sendMessage(chatId, "✨ **ارتباط برقرار شد!**\n\nدسترسی شما آپدیت شد. جهت دریافت پنل، **راهنما** را ارسال کنید.", msg.message_id, rulesBtn);
      }
    }

    if (g.group_lock_until) {
      if (Date.now() >= g.group_lock_until) {
        g.group_lock_until = null;
        await saveGroupData(env, chatId, g);
        await tgCall("setChatPermissions", {
          chat_id: chatId,
          permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true }
        });
        await sendMessage(chatId, "🔓 **زمان قفل گروه به پایان رسید. گروه باز شد!**");
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (g.stats.date !== todayStr) {
      g.stats.today = 0;
      g.stats.date = todayStr;
    }
    g.stats.total += 1;
    g.stats.today += 1;
    g.stats.user_msg_count[userId] = (g.stats.user_msg_count[userId] || 0) + 1;
    g.stats.user_names[userId] = msg.from.first_name || "کاربر";

    if (msg.new_chat_members) {
      for (const m of msg.new_chat_members) {
        if (m.is_bot && String(m.id) === String(BOT_TOKEN.split(":")[0])) {
          g.adder_id = userId;
          await saveGroupData(env, chatId, g);
          await sendMessage(chatId, "✨ **ربات فعال شد!**\n\n👤 کاربر [" + msg.from.first_name + "](tg://user?id=" + userId + ") مالکیّت ربات را دریافت کرد.\n\nجهت دریافت پنل، **راهنما** را ارسال کنید.");
        } else if (!m.is_bot) {
          if (m.id !== userId) {
            if (!g.user_added_ids[userId]) g.user_added_ids[userId] = [];
            if (!g.user_added_ids[userId].includes(m.id)) {
              g.user_added_ids[userId].push(m.id);
            }
          }
          const welcomeText = g.welcome_text || DEFAULT_WELCOME;
          const welcomeMsg = welcomeText.replace(/{name}/g, "[" + m.first_name + "](tg://user?id=" + m.id + ")");
          const rulesBtn = { inline_keyboard: [[{ text: "📜 قوانین گروه", callback_data: "show_rules" }]] };
          await sendMessage(chatId, welcomeMsg, msg.message_id, rulesBtn);
        }
      }
      await saveGroupData(env, chatId, g);
      return;
    }

    if (!g.members.includes(userId)) {
      g.members.push(userId);
    }
    await saveGroupData(env, chatId, g);

    const userIsAdmin = await isAdmin(env, chatId, userId);

    if (!userIsAdmin && g.group_lock_until && Date.now() < g.group_lock_until) {
      return await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
    }

    if (g.muted_users[userId]) {
      const muteExpiry = g.muted_users[userId];
      if (muteExpiry !== "perm" && Date.now() >= muteExpiry) {
        delete g.muted_users[userId];
        await saveGroupData(env, chatId, g);
        await tgCall("restrictChatMember", {
          chat_id: chatId,
          user_id: userId,
          permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true }
        });
      } else {
        return await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      }
    }

    if (!userIsAdmin) {
      if (g.req_adds > 0) {
        const addedList = g.user_added_ids[userId] || [];
        if (addedList.length < g.req_adds) {
          await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
          const warningText = `⚠️ کاربر [` + msg.from.first_name + `](tg://user?id=` + userId + `)، برای پیام دادن باید حداقل **${g.req_adds}** نفر به گروه دعوت کنید.\n👥 تعداد دعوت‌شده‌های شما: **${addedList.length}** از **${g.req_adds}**`;
          const sentWarn = await sendMessage(chatId, warningText);
          if (sentWarn.ok && sentWarn.result && sentWarn.result.message_id) {
            setTimeout(async () => {
              await tgCall("deleteMessage", { chat_id: chatId, message_id: sentWarn.result.message_id });
            }, 5000);
          }
          return;
        }
      }

      const forcedChannels = g.forced_channels || [];
      if (forcedChannels.length > 0) {
        let isMemberAll = true;
        for (const ch of forcedChannels) {
          const joined = await checkChannelMember(ch, userId);
          if (!joined) {
            isMemberAll = false;
            break;
          }
        }

        if (!isMemberAll) {
          await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
          const warningText = `⚠️ کاربر ` + msg.from.first_name + `، برای پیام دادن اول باید توی این کانال‌ها عضو باشید:`;
          return await sendMessage(chatId, warningText, null, getMultiChannelKeyboard(forcedChannels));
        }
      }

      if (text && g.filtered_words) {
        const lowerText = text.toLowerCase();
        for (const [fWord] of Object.entries(g.filtered_words)) {
          if (lowerText.includes(fWord.toLowerCase())) {
            return await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
          }
        }
      }

      if (g.spam_limit && g.spam_limit > 0) {
        const now = Date.now();
        if (!g.user_recent_msgs[userId]) g.user_recent_msgs[userId] = [];
        g.user_recent_msgs[userId] = g.user_recent_msgs[userId].filter(t => now - t < 5000);
        g.user_recent_msgs[userId].push(now);

        if (g.user_recent_msgs[userId].length > g.spam_limit) {
          g.user_recent_msgs[userId] = [];
          await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });

          const act = g.spam_action || { type: "mute", minutes: 5 };
          if (act.type === "ban") {
            await saveGroupData(env, chatId, g);
            await tgCall("banChatMember", { chat_id: chatId, user_id: userId });
            return await sendMessage(chatId, "⚠️ کاربر [" + msg.from.first_name + "](tg://user?id=" + userId + ") به دلیل ارسال اسپم بیش از حد اخراج شد.");
          } else if (act.type === "warn") {
            const currentWarns = (g.warns[userId] || 0) + 1;
            g.warns[userId] = currentWarns;
            await saveGroupData(env, chatId, g);
            return await sendMessage(chatId, "⚠️ کاربر [" + msg.from.first_name + "](tg://user?id=" + userId + ") به دلیل اسپم یک اخطار دریافت کرد. (" + currentWarns + "/" + (g.max_warns || 3) + ")");
          } else {
            const mTime = act.minutes || 5;
            const expireTime = Date.now() + mTime * 60 * 1000;
            g.muted_users[userId] = expireTime;
            await saveGroupData(env, chatId, g);
            await tgCall("restrictChatMember", { chat_id: chatId, user_id: userId, permissions: { can_send_messages: false }, until_date: Math.floor(expireTime / 1000) });
            return await sendMessage(chatId, "🔇 کاربر [" + msg.from.first_name + "](tg://user?id=" + userId + ") به دلیل اسپم به مدت **" + mTime + " دقیقه** مسدود شد.");
          }
        }
        await saveGroupData(env, chatId, g);
      }

      const locks = g.locks;
      const hasLink = text && (text.includes("http://") || text.includes("https://") || text.includes("t.me/"));
      const hasUsername = text && (text.includes("@") || text.includes("telegram.me/"));
      const isForward = msg.forward_from || msg.forward_from_chat || msg.forward_date;
      const hasPersian = /[\u0600-\u06FF]/.test(text);
      const hasEnglish = /[a-zA-Z]/.test(text);
      const hasHashtag = text && text.includes("#");

      if (locks.forward && isForward) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, `کاربر ${userId} قفل فروارد فعال است به همین دلیل پیامتون پاک میشه`);
      }

      if (locks.persian && hasPersian) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, `🔒 قفل فارسی فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل داشتن متن فارسی حذف شد.\n🛡️ قابلیت قفل فارسی برای حفظ نظم و امنیت فعال است؛ بنابراین در صورت ارسال متن فارسی، پیام به‌صورت خودکار حذف خواهد شد.\n💡 لطفاً قوانین گروه را رعایت کنید.`);
      }

      if (locks.english && hasEnglish) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, `🔒 قفل انگلیسی فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل داشتن متن انگلیسی حذف شد.\n🛡️ قابلیت قفل انگلیسی برای حفظ نظم و امنیت فعال است؛ بنابراین در صورت ارسال متن انگلیسی، پیام به‌صورت خودکار حذف خواهد شد.\n💡 لطفاً قوانین گروه را رعایت کنید.`);
      }

      if (locks.hashtag && hasHashtag) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, `🔒 قفل هشتگ فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل داشتن هشتگ حذف شد.\n🛡️ قابلیت قفل هشتگ برای حفظ نظم و امنیت فعال است؛ بنابراین در صورت استفاده از هشتگ، پیام به‌صورت خودکار حذف خواهد شد.\n💡 لطفاً قوانین گروه را رعایت کنید.`);
      }

      if (g.saved_link && hasLink) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, g.saved_link);
      }

      if (
        (locks.link && hasLink) ||
        (locks.username && hasUsername) ||
        (locks.photo && msg.photo) ||
        (locks.sticker && (msg.sticker || msg.animation)) ||
        (locks.location && msg.location) ||
        (locks.video && msg.video) ||
        (locks.audio && (msg.audio || msg.voice))
      ) {
        return await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      }
    }

    if (userIsAdmin && text === "تبدیل استیکر به عکس" && msg.reply_to_message && msg.reply_to_message.sticker) {
      const sticker = msg.reply_to_message.sticker;
      const fileId = sticker.file_id;
      
      try {
        const fileRes = await tgCall("getFile", { file_id: fileId });
        if (fileRes.ok && fileRes.result && fileRes.result.file_path) {
          const filePath = fileRes.result.file_path;
          const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
          await tgCall("sendPhoto", {
            chat_id: chatId,
            photo: photoUrl,
            caption: "✨ استیکر با موفقیت به عکس تبدیل شد.",
            reply_to_message_id: msg.reply_to_message.message_id
          });
          return;
        }
      } catch (e) {
        return await sendMessage(chatId, "❌ خطا در تبدیل استیکر به عکس.", msg.message_id);
      }
    }

    const calcMatch = text.match(/^([\d\.]+)\s*([\+\-\*\/×÷])\s*([\d\.]+)$/);
    if (calcMatch) {
      const num1 = parseFloat(calcMatch[1]);
      const op = calcMatch[2];
      const num2 = parseFloat(calcMatch[3]);
      let result;
      if (op === "+") result = num1 + num2;
      else if (op === "-") result = num1 - num2;
      else if (op === "*" || op === "×") result = num1 * num2;
      else if (op === "/" || op === "÷") result = num2 !== 0 ? num1 / num2 : "خطا (تقسیم بر صفر)";
      return await sendMessage(chatId, `جواب: ${result}`, msg.message_id);
    }

    if (text === "تاریخ") {
      const d = getFullDateDetails();
      const dateMsg = "📅 **امروز:**\n\n▫️ **شمسی:** " + d.jalali + "\n▫️ **میلادی:** " + d.gregorian + "\n▫️ **قمری:** " + d.hijri + "\n🕒 **ساعت:** " + d.time;
      return await sendMessage(chatId, dateMsg, msg.message_id);
    }

    if (text === "فال") {
      const fortunes = [
        "🔮 **فال حافظ:**\n\nصبا گر عطر مهری می‌پراکنی به سر کن\nکه از این باغ بی‌برگ نفعی نتوان برد...\n✨ نیت شما روشن است، به زودی به مراد دلتان می‌رسید.",
        "🔮 **فال حافظ:**\n\nهر آن کس که در این حلقه نیست زنده به عشق\nبر او نمرده به فتوای من منم که گواه...\n✨ در کارها صبر پیشه کنید، گشایش بزرگی در راه است.",
        "🔮 **فال حافظ:**\n\nدوش دیدم که ملائک در میخانه زدند\nگل آدم سرشتند و به پیمانه زدند...\n✨ به زودی خبری به شما می‌رسد که دلتان شاد خواهد شد.",
        "🔮 **فال حافظ:**\n\nساقی به نور باده بر افروز جام ما\nبگفت که کار جهان شد به کام ما...\n✨ توکل به خدا کنید، آینده‌ای روشن پیش رو دارید."
      ];
      const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];
      return await sendMessage(chatId, randomFortune, msg.message_id);
    }

    if (text === "تاس") {
      const diceVal = Math.floor(Math.random() * 6) + 1;
      const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
      return await sendMessage(chatId, "🎲 تاس ریخته شد...\nنتیجه: **" + diceVal + "** " + diceEmojis[diceVal - 1], msg.message_id);
    }

    if (text === "سکه") {
      const coinVal = Math.random() < 0.5 ? "🪙 **شیر** (خط آمد!)" : "🪙 **خط** (شیر آمد!)";
      return await sendMessage(chatId, "پرتاب سکه...\nنتیجه: " + coinVal, msg.message_id);
    }

    if (text === "شانس") {
      const luckPercent = Math.floor(Math.random() * 101);
      return await sendMessage(chatId, "🍀 میزان شانس امروز شما:\n\n✨ **" + luckPercent + "٪** خوش‌شانسی!", msg.message_id);
    }

    if (text.startsWith("فونت ")) {
      const wordToFont = text.replace("فونت ", "").trim();
      const fonts = [
        wordToFont.split("").map(c => {
          const map = {a:"𝖆",b:"𝖇",c:"𝖈",d:"𝖉",e:"𝖊",f:"𝖋",g:"𝖌",h:"𝍍",i:"𝖎",j:"𝖏",k:"𝖐",l:"𝖑",m:"𝖒",n:"𝖓",o:"𝖔",p:"𝕕",q:"𝗾",r:"𝖗",s:"𝖘",t:"𝖙",u:"𝖚",v:"𝖛",w:"𝖜",x:"𝝗",y:"𝗒",z:"𝖟"};
          return map[c.toLowerCase()] || c;
        }).join(""),
        wordToFont.split("").map(c => {
          const map = {a:"𝓪",b:"𝓫",c:"𝓬",d:"𝓭",e:"𝓮",f:"𝓯",g:"𝓰",h:"𝓱",i:"𝓲",j:"𝓳",k:"𝓴",l:"𝓵",m:"𝓶",n:"𝓷",o:"𝓸",p:"𝓹",q:"𝓺",r:"𝓻",s:"𝓼",t:"𝓽",u:"𝓾",v:"𝓿",w:"𝔀",x:"𝔁",y:"𝔂",z:"𝔃"};
          return map[c.toLowerCase()] || c;
        }).join(""),
        wordToFont.split("").map(c => {
          const map = {a:"𝔸",b: "𝔹",c:"ℂ",d:"𝔻",e:"𝔼",f:"𝔽",g:"𝔾",h:"ℍ",i:"𝕀",j:"𝕁",k:"𝕂",l:"𝕃",m:"𝕄",n:"ℕ",o:"𝕆",p:"ℙ",q:"ℚ",r:"ℝ",s:"𝕊",t:"𝕋",u:"𝕌",v:"𝕍",w:"𝕎",x:"𝕏",y:"𝕐",z:"ℤ"};
          return map[c.toLowerCase()] || c;
        }).join(""),
        wordToFont.split("").map(c => {
          const map = {a:"ⓐ",b:"ⓑ",c:"ⓒ",d:"ⓓ",e:"ⓔ",f:"ⓕ",g:"ⓖ",h:"ⓗ",i:"ⓘ",j:"ⓙ",k:"ⓚ",l:"ⓛ",m:"ⓜ",n:"ⓝ",o:"ⓞ",p:"ⓟ",q:"ⓠ",r:"ⓡ",s:"ⓢ",t:"ⓣ",u:"ⓤ",v:"ⓥ",w:"ⓦ",x:"ⓧ",y:"ⓨ",z:"ⓩ"};
          return map[c.toLowerCase()] || c;
        }).join("")
      ];
      const fontResponse = `✨ فونت‌های قشنگ و خفن برای کلمه [ ${wordToFont} ]:\n\n1️⃣ ${fonts[0]}\n2️⃣ ${fonts[1]}\n3️⃣ ${fonts[2]}\n4️⃣ ${fonts[3]}`;
      return await sendMessage(chatId, fontResponse, msg.message_id);
    }

    if (text === "موجودی") {
      const uData = getUserData(cfg, userId);
      await saveGlobalConfig(env, cfg);
      const displayCoins = (userId === OWNER_ID) ? "♾ (بینهایت)" : uData.coins;
      return await sendMessage(chatId, "🪙 موجودی سکه شما: **" + displayCoins + "** عدد", msg.message_id);
    }

    if (text === "پروفایل") {
      const uData = getUserData(cfg, userId);
      await saveGlobalConfig(env, cfg);
      const displayCoins = (userId === OWNER_ID) ? "♾ (بینهایت)" : uData.coins;
      const profileText = "👤 پروفایل شما:\n\n" +
        "▫️ نام: " + msg.from.first_name + "\n" +
        "▫️ آیدی عددی: `" + userId + "`\n" +
        "▫️ موجودی سکه: " + displayCoins + "\n" +
        "▫️ هدایا: (برای مشاهده روی دکمه هدایا بزنید)";
      
      const profileMarkup = {
        inline_keyboard: [
          [
            { text: "🪙 موجودی", callback_data: "profile_balance" },
            { text: "🎁 هدایا", callback_data: "profile_gifts" }
          ],
          [
            { text: "🌐 مشاهده هدایای دیگران", callback_data: "show_all_gifts" }
          ]
        ]
      };
      return await sendMessage(chatId, profileText, msg.message_id, profileMarkup);
    }

    if (text === "فروشگاه" || text === "محصولات") {
      let shopSummaryText = "🛒 **بخش فروشگاه و محصولات ربات**\n\nبرای مشاهده لیست کامل محصولات و خرید روی دکمه‌ی زیر کلیک کنید:";
      const shopMarkup = {
        inline_keyboard: [
          [
            { text: "🛒 مشاهده محصولات", callback_data: "show_shop_items" }
          ]
        ]
      };
      return await sendMessage(chatId, shopSummaryText, msg.message_id, shopMarkup);
    }

    if (text.startsWith("خرید") || text.startsWith("خرید ")) {
      const itemName = text.replace(/^خرید\s*/, "").trim();
      const targetItem = SHOP_ITEMS.find(i => i.name === itemName);
      if (!targetItem) {
        return await sendMessage(chatId, "❌ این هدیه در فروشگاه وجود ندارد. دستور `فروشگاه` یا `محصولات` را ببینید.", msg.message_id);
      }

      let uData = getUserData(cfg, userId);
      if (userId !== OWNER_ID && uData.coins < targetItem.price) {
        return await sendMessage(chatId, "❌ موجودی کافی نیست! لطفاً موجودی خود را شارژ کنید.\nموجودی فعلی شما: " + uData.coins + " سکه", msg.message_id);
      }

      if (userId !== OWNER_ID) {
        uData.coins -= targetItem.price;
      }
      uData.gifts.push(targetItem.name);
      await saveGlobalConfig(env, cfg);
      const displayCoins = (userId === OWNER_ID) ? "♾ (بینهایت)" : uData.coins;
      return await sendMessage(chatId, "✅ خرید با موفقیت ثبت شد!\n🎁 هدیه **" + targetItem.name + "** به بخش هدایای شما اضافه شد.\n💰 سکه باقی‌مانده: " + displayCoins, msg.message_id);
    }

    if (text === "پاک کردن هدایا") {
      let uData = getUserData(cfg, userId);
      if (uData.gifts.length === 0) {
        return await sendMessage(chatId, "❌ شما هیچ هدیه‌ای در پروفایل خود ندارید.", msg.message_id);
      }
      uData.gifts = [];
      await saveGlobalConfig(env, cfg);
      return await sendMessage(chatId, "✅ تمامی هدایای شما با موفقیت از پروفایل پاک شدند.", msg.message_id);
    }

    if (text === "گردونه") {
      let uData = getUserData(cfg, userId);
      const cost = 100;
      if (userId !== OWNER_ID && uData.coins < cost) {
        return await sendMessage(chatId, "❌ برای شرکت در گردونه حداقل به **" + cost + "** سکه نیاز دارید.\nموجودی فعلی شما: " + uData.coins + " سکه", msg.message_id);
      }

      if (userId !== OWNER_ID) {
        uData.coins -= cost;
      }
      
      const randVal = Math.random() * 100;
      let prizeText = "";
      let prizeCoins = 0;

      if (randVal <= 2) {
        prizeCoins = 3000;
        uData.coins += prizeCoins;
        prizeText = "🎉 فوق‌العاده! شما برنده **۳,۰۰۰ سکه** شدید! (شانس ۲٪)";
      } else if (randVal <= 32) {
        prizeCoins = 500;
        uData.coins += prizeCoins;
        prizeText = "🎁 عالی! شما برنده **۵۰۰ سکه** شدید! (شانس ۳۰٪)";
      } else {
        prizeText = "💔 پوچ! متأسفانه این بار چیزی برنده نشدید.";
      }

      await saveGlobalConfig(env, cfg);
      const displayCoins = (userId === OWNER_ID) ? "♾ (بینهایت)" : uData.coins;
      const resMsg = "🎡 **نتیجه چرخش گردونه:**\n\n" + prizeText + "\n💰 موجودی جدید شما: **" + displayCoins + "** سکه";
      return await sendMessage(chatId, resMsg, msg.message_id);
    }

    if (text.startsWith("انتقال ")) {
      const parts = text.replace("انتقال ", "").trim().split(/\s+/);
      const targetUserId = parts[0];
      const secondParam = parts[1];

      if (!targetUserId || !secondParam) {
        return await sendMessage(chatId, "❌ فرمت دستور اشتباه است.\nمثال انتقال هدیه: `انتقال [آیدی_عددی] [ایموجی_هدیه]`\nمثال انتقال سکه: `انتقال [آیدی_عددی] [تعداد_سکه]`", msg.message_id);
      }

      if (!isNaN(secondParam)) {
        const amount = parseInt(secondParam);
        if (amount <= 0) {
          return await sendMessage(chatId, "❌ مقدار سکه باید بیشتر از صفر باشد.", msg.message_id);
        }

        let senderData = getUserData(cfg, userId);
        if (userId !== OWNER_ID && senderData.coins < amount) {
          return await sendMessage(chatId, "❌ موجودی سکه شما برای این انتقال کافی نیست!\nموجودی فعلی: " + senderData.coins, msg.message_id);
        }

        if (userId !== OWNER_ID) {
          senderData.coins -= amount;
        }

        let targetData = getUserData(cfg, targetUserId);
        targetData.coins += amount;
        await saveGlobalConfig(env, cfg);

        await sendMessage(targetUserId, "🎁 کاربر [" + msg.from.first_name + "](tg://user?id=" + userId + ") تعداد **" + amount + "** سکه به شما انتقال داد!\n🪙 موجودی جدید: " + targetData.coins).catch(() => {});
        return await sendMessage(chatId, "✅ تعداد **" + amount + "** سکه با موفقیت به کاربر `" + targetUserId + "` انتقال یافت.", msg.message_id);
      } else {
        const giftEmoji = secondParam;
        let senderData = getUserData(cfg, userId);
        const giftIndex = senderData.gifts.indexOf(giftEmoji);

        if (giftIndex === -1 && userId !== OWNER_ID) {
          return await sendMessage(chatId, "❌ شما این هدیه را در پروفایل خود ندارید!", msg.message_id);
        }

        if (userId !== OWNER_ID) {
          senderData.gifts.splice(giftIndex, 1);
        }

        let targetData = getUserData(cfg, targetUserId);
        targetData.gifts.push(giftEmoji);
        await saveGlobalConfig(env, cfg);

        await sendMessage(targetUserId, "🎁 کاربر [" + msg.from.first_name + "](tg://user?id=" + userId + ") هدیه **" + giftEmoji + "** را به بخش هدایای پروفایل شما انتقال داد!").catch(() => {});
        return await sendMessage(chatId, "✅ هدیه **" + giftEmoji + "** با موفقیت به بخش هدایای کاربر `" + targetUserId + "` انتقال یافت.", msg.message_id);
      }
    }

    if (text === "سازنده") {
      const channelUsername = DEFAULT_CHANNEL.replace("@", "");
      const devMarkup = {
        inline_keyboard: [
          [{ text: "👤 سازنده", url: "https://t.me/kiarash1792" }],
          [{ text: "📢 چنل ربات", url: "https://t.me/" + channelUsername }]
        ]
      };
      return await sendMessage(chatId, "⚙️ **اطلاعات سازنده و کانال رسمی ربات:**", msg.message_id, devMarkup);
    }

    if (text.startsWith("مخفی ") && msg.reply_to_message) {
      const secretText = text.replace("مخفی ", "").trim();
      if (secretText) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        const sentSec = await sendMessage(chatId, secretText, msg.reply_to_message.message_id);
        if (sentSec.ok && sentSec.result && sentSec.result.message_id) {
          setTimeout(async () => {
            await tgCall("deleteMessage", { chat_id: chatId, message_id: sentSec.result.message_id });
          }, 0);
        }
        return;
      }
    }

    if (text.startsWith("پیام ")) {
      const match = text.match(/^پیام\s+@?([a-zA-Z0-9_]+)\s+(.+)$/s);
      if (match) {
        const targetUser = match[1].toLowerCase();
        const msgContent = match[2].trim();
        const secretKey = Date.now().toString() + "_" + Math.floor(Math.random() * 1000);

        if (env && env.BOT_KV) {
          await env.BOT_KV.put("secret:" + secretKey, msgContent, { expirationTtl: 86400 });
        }

        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });

        const secretBtn = {
          inline_keyboard: [[
            { text: "🔒 برای بازکردن پیام کلیک کنید", callback_data: "secret_" + targetUser + "_" + secretKey }
          ]]
        };

        const sentMsg = await sendMessage(chatId, "📩 **یک پیام مخفی برای @" + targetUser + " ارسال شد!**", null, secretBtn);
        if (sentMsg.ok && sentMsg.result && sentMsg.result.message_id) {
          setTimeout(async () => {
            await tgCall("deleteMessage", { chat_id: chatId, message_id: sentMsg.result.message_id });
          }, 0);
        }
        return;
      }
    }

    if (text === "قوانین") {
      const rulesStr = (g.rules && g.rules.trim() !== "") ? g.rules : "قوانینی ثبت نشده است.";
      return await sendMessage(chatId, "📜 **قوانین گروه:**\n\n" + rulesStr, msg.message_id);
    }

    if (text === "راهنما" || text === "/help") {
      if (!userIsAdmin) return await sendMessage(chatId, "❌ این دستور فقط برای مدیران و مالک گروه فعال است.", msg.message_id);
      return await sendMessage(chatId, getHelpText("main"), msg.message_id, getHelpKeyboard("main"));
    }

    if (text === "اصل" && g.saved_asl) {
      return await sendMessage(chatId, g.saved_asl, msg.message_id);
    }

    if (text === "لینک ها" && g.saved_link) {
      return await sendMessage(chatId, `لینک ثبت شده:\n${g.saved_link}`, msg.message_id);
    }

    if (userIsAdmin) {
      if (text === "ثبت اصل" && msg.reply_to_message) {
        const replyText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
        g.saved_asl = replyText;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ اصل با موفقیت ثبت شد.", msg.message_id);
      }

      if (text === "حذف اصل") {
        g.saved_asl = null;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ اصل ثبت‌شده حذف شد.", msg.message_id);
      }

      if (text.startsWith("ثبت لینک اینجا ")) {
        const linkVal = text.replace("ثبت لینک اینجا ", "").trim();
        g.saved_link = linkVal;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ لینک مورد نظر با موفقیت ثبت شد.", msg.message_id);
      }

      if (text.startsWith("حذف لینک اینجا ")) {
        g.saved_link = null;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ لینک ثبت‌شده حذف شد.", msg.message_id);
      }

      if (text.startsWith("تنظیم عضویت اجباری ")) {
        const chName = text.replace("تنظیم عضویت اجباری ", "").trim();
        if (!chName) return await sendMessage(chatId, "❌ لطفاً یوزرنیم کانال را وارد کنید.", msg.message_id);
        
        if (!g.forced_channels) g.forced_channels = [];
        if (g.forced_channels.length >= 10) {
          return await sendMessage(chatId, "❌ حداکثر می‌توان ۱۰ کانال برای عضویت اجباری ثبت کرد.", msg.message_id);
        }

        const formattedCh = chName.startsWith("@") ? chName : "@" + chName;
        if (!g.forced_channels.includes(formattedCh)) {
          g.forced_channels.push(formattedCh);
          await saveGroupData(env, chatId, g);
        }
        return await sendMessage(chatId, `✅ کانال **${formattedCh}** با موفقیت به لیست عضویت اجباری اضافه شد.\nتعداد کل کانال‌ها: ${g.forced_channels.length}`, msg.message_id);
      }

      if (text.startsWith("حذف عضویت اجباری ")) {
        const chName = text.replace("حذف عضویت اجباری ", "").trim();
        const formattedCh = chName.startsWith("@") ? chName : "@" + chName;
        
        g.forced_channels = (g.forced_channels || []).filter(c => c !== formattedCh);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, `✅ کانال **${formattedCh}** از لیست عضویت اجباری حذف شد.`, msg.message_id);
      }

      if (text === "لیست عضویت اجباری" || text === "لیست کانال ها") {
        const channels = g.forced_channels || [];
        if (channels.length === 0) return await sendMessage(chatId, "هیچ کانالی برای عضویت اجباری تنظیم نشده است.", msg.message_id);
        
        let listStr = "📢 **لیست کانال‌های عضویت اجباری:**\n\n";
        channels.forEach((c, idx) => {
          listStr += `${idx + 1}. \`${c}\`\n`;
        });
        return await sendMessage(chatId, listStr, msg.message_id);
      }

      if (text.startsWith("فیلتر ")) {
        const word = text.replace("فیلتر ", "").trim();
        if (!word) return;

        g.filtered_words[word] = { type: "delete" };
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کلمه **" + word + "** با موفقیت فیلتر شد.", msg.message_id);
      }

      if (text.startsWith("حذف فیلتر ")) {
        const word = text.replace("حذف فیلتر ", "").trim();
        if (g.filtered_words[word]) {
          delete g.filtered_words[word];
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ کلمه **" + word + "** از لیست فیلتر کلمات پاک شد.", msg.message_id);
        }
        return await sendMessage(chatId, "این کلمه در لیست فیلتر وجود ندارد.", msg.message_id);
      }

      if (text === "لیست فیلتر" || text === "لیست فیلتر کلمات") {
        let fList = "📝 **لیست کلمات فیلتر شده:**\n\n";
        const keys = Object.keys(g.filtered_words || {});
        if (keys.length === 0) return await sendMessage(chatId, "هیچ کلمه‌ای فیلتر نشده است.", msg.message_id);
        
        keys.forEach((w, idx) => {
          fList += (idx + 1) + ". `" + w + "`\n";
        });
        return await sendMessage(chatId, fList, msg.message_id);
      }

      if (text === "قفل گروه" || text.startsWith("قفل گروه ")) {
        const param = text.replace("قفل گروه", "").trim();
        if (!param) {
          g.group_lock_until = Date.now() + 365 * 24 * 60 * 60 * 1000;
          await saveGroupData(env, chatId, g);
          await tgCall("setChatPermissions", { chat_id: chatId, permissions: { can_send_messages: false } });
          return await sendMessage(chatId, "🔒 **گروه کاملاً قفل شد.**", msg.message_id);
        }
        const hours = parseFloat(param);
        if (!isNaN(hours) && hours > 0) {
          const lockDuration = hours * 60 * 60 * 1000;
          g.group_lock_until = Date.now() + lockDuration;
          await saveGroupData(env, chatId, g);
          await tgCall("setChatPermissions", { chat_id: chatId, permissions: { can_send_messages: false } });
          return await sendMessage(chatId, "🔒 **گروه به مدت " + hours + " ساعت قفل شد.**", msg.message_id);
        }
      }

      if (text === "بازکردن گروه" || text === "حذف قفل گروه") {
        g.group_lock_until = null;
        await saveGroupData(env, chatId, g);
        await tgCall("setChatPermissions", {
          chat_id: chatId,
          permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true }
        });
        return await sendMessage(chatId, "🔓 **قفل گروه برداشته شد.**", msg.message_id);
      }

      if (text.startsWith("تنظیم اسپم ")) {
        const val = text.replace("تنظیم اسپم ", "").trim();
        if (val === "غیرفعال") {
          g.spam_limit = 0;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🚫 **سیستم آنتی اسپم غیرفعال شد.**", msg.message_id);
        }
        const num = parseInt(val);
        if (!isNaN(num) && num > 0) {
          g.spam_limit = num;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚙️ حد مجاز پیام متوالی اسپم روی **" + num + " پیام در ۵ ثانیه** تنظیم شد.", msg.message_id);
        }
      }

      if (text.startsWith("تنظیم مجازات اسپم ")) {
        const parts = text.replace("تنظیم مجازات اسپم ", "").trim().split(/\s+/);
        const type = parts[0];
        const time = parts[1] ? parseInt(parts[1]) : 5;

        if (type === "بن") {
          g.spam_action = { type: "ban" };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚙️ مجازات اسپم روی **بن (اخراج)** تنظیم شد.", msg.message_id);
        } else if (type === "اخطار") {
          g.spam_action = { type: "warn" };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚙️ مجازات اسپم روی **ثبت اخطار** تنظیم شد.", msg.message_id);
        } else if (type === "سکوت") {
          g.spam_action = { type: "mute", minutes: time };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚙️ مجازات اسپم روی **" + time + " دقیقه سکوت** تنظیم شد.", msg.message_id);
        }
      }

      if (text === "پین" && msg.reply_to_message) {
        await tgCall("pinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        return await sendMessage(chatId, "📌 پیام با موفقیت سنجاق شد.", msg.message_id);
      }

      if (text === "انپین") {
        await tgCall("unpinChatMessage", { chat_id: chatId });
        return await sendMessage(chatId, "📌 پیام سنجاق‌شده برداشته شد.", msg.message_id);
      }

      if (text === "اخطار" && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        const targetAdmin = await isAdmin(env, chatId, target.id);
        if (targetAdmin) return await sendMessage(chatId, "❌ نمی‌توان به مدیران اخطار داد.", msg.message_id);

        const maxW = g.max_warns || 3;
        const currentWarns = (g.warns[target.id] || 0) + 1;
        g.warns[target.id] = currentWarns;

        if (currentWarns >= maxW) {
          g.warns[target.id] = 0;
          await saveGroupData(env, chatId, g);

          if (g.warn_action === "ban") {
            await tgCall("banChatMember", { chat_id: chatId, user_id: target.id });
            return await sendMessage(chatId, "⚠️ کاربر [" + target.first_name + "](tg://user?id=" + target.id + ") به دلیل دریافت **" + maxW + "** اخطار، اخراج شد.", msg.message_id);
          } else {
            const expireTime = Date.now() + 60 * 60 * 1000;
            g.muted_users[target.id] = expireTime;
            await saveGroupData(env, chatId, g);
            await tgCall("restrictChatMember", { chat_id: chatId, user_id: target.id, permissions: { can_send_messages: false }, until_date: Math.floor(expireTime / 1000) });
            return await sendMessage(chatId, "⚠️ کاربر [" + target.first_name + "](tg://user?id=" + target.id + ") به دلیل دریافت **" + maxW + "** اخطار، به مدت ۱ ساعت مسدود شد.", msg.message_id);
          }
        } else {
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚠️ کاربر [" + target.first_name + "](tg://user?id=" + target.id + ") یک اخطار دریافت کرد.\nتعداد اخطارها: **" + currentWarns + " از " + maxW + "**", msg.message_id);
        }
      }

      if (text === "حذف اخطار" && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        if (g.warns[target.id] && g.warns[target.id] > 0) {
          g.warns[target.id] -= 1;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ یک اخطار از کاربر [" + target.first_name + "](tg://user?id=" + target.id + ") کسر شد.", msg.message_id);
        }
        return await sendMessage(chatId, "این کاربر هیچ اخطاری ندارد.", msg.message_id);
      }

      if (text.startsWith("تنظیم حداکثر اخطار ")) {
        const num = parseInt(text.replace("تنظیم حداکثر اخطار ", "").trim());
        if (!isNaN(num) && num > 0) {
          g.max_warns = num;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚙️ حد مجاز اخطارها روی **" + num + "** تنظیم شد.", msg.message_id);
        }
      }

      if (text.startsWith("تنظیم مجازات اخطار ")) {
        const act = text.replace("تنظیم مجازات اخطار ", "").trim();
        if (act === "بن" || act === "سکوت") {
          g.warn_action = act === "بن" ? "ban" : "mute";
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚙️ مجازات رسیدن اخطارها به حد مجاز روی **" + act + "** تنظیم شد.", msg.message_id);
        }
      }

      if (text.startsWith("تنظیم خوشامد ")) {
        g.welcome_text = text.replace("تنظیم خوشامد ", "").trim();
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ متن خوشامدگویی جدید با موفقیت ذخیره شد.", msg.message_id);
      }

      if ((text === "سکوت" || text.startsWith("سکوت ") || text === "خالی" || text.startsWith("خالی") || text === "خفه") && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        const targetAdmin = await isAdmin(env, chatId, target.id);
        if (targetAdmin) return await sendMessage(chatId, "❌ نمی‌توان مدیران گروه را سکوت کرد.", msg.message_id);

        const param = text.replace("سکوت", "").replace("خالی", "").replace("خفه", "").trim();
        if (!param) {
          g.muted_users[target.id] = "perm";
          await saveGroupData(env, chatId, g);
          await tgCall("restrictChatMember", {
            chat_id: chatId,
            user_id: target.id,
            permissions: { can_send_messages: false }
          });
          return await sendMessage(chatId, "🔇 کاربر [ " + target.first_name + " ](tg://user?id=" + target.id + ") با آیدی `" + target.id + "` به صورت دائمی سکوت شد.", msg.message_id);
        } else {
          const minutes = parseInt(param);
          if (!isNaN(minutes) && minutes > 0) {
            const expireTime = Date.now() + minutes * 60 * 1000;
            g.muted_users[target.id] = expireTime;
            await saveGroupData(env, chatId, g);

            await tgCall("restrictChatMember", {
              chat_id: chatId,
              user_id: target.id,
              permissions: { can_send_messages: false },
              until_date: Math.floor(expireTime / 1000)
            });

            return await sendMessage(chatId, "🔇 کاربر [ " + target.first_name + " ](tg://user?id=" + target.id + ") با آیدی `" + target.id + "` به مدت " + minutes + " دقیقه مسدود شد.", msg.message_id);
          }
        }
      }

      if (text === "حذف سکوت" && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        delete g.muted_users[target.id];
        await saveGroupData(env, chatId, g);

        await tgCall("restrictChatMember", {
          chat_id: chatId,
          user_id: target.id,
          permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true }
        });

        return await sendMessage(chatId, "🔊 محدودیت ارسال پیام برای [ " + target.first_name + " ](tg://user?id=" + target.id + ") برداشته شد.", msg.message_id);
      }

      if (text.startsWith("قفل ") || text.startsWith("بازکردن ")) {
        const isLock = text.startsWith("قفل ");
        const type = text.replace("قفل ", "").replace("بازکردن ", "").trim();

        if (type === "عکس") {
          g.locks.photo = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل ارسال عکس **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "گیف" || type === "استیکر") {
          g.locks.sticker = isLock;
          g.locks.animation = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل استیکر و گیف **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "مکان") {
          g.locks.location = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل ارسال مکان **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "لینک") {
          g.locks.link = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل ارسال لینک **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "ایدی") {
          g.locks.username = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل ارسال آیدی/تگ **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "فروارد") {
          g.locks.forward = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل فروارد **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "فارسی") {
          g.locks.persian = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل فارسی **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "انگلیسی") {
          g.locks.english = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل انگلیسی **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "ویرایش") {
          g.locks.edit = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل ویرایش **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        if (type === "هشتگ") {
          g.locks.hashtag = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل هشتگ **" + (isLock ? "فعال" : "غیرفعال") + "** شد.", msg.message_id);
        }

        const map = { "فیلم": "video", "اهنگ": "audio" };
        if (map[type]) {
          g.locks[map[type]] = isLock;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "🔐 قفل ( " + type + " ) " + (isLock ? "فعال" : "غیرفعال") + " شد.", msg.message_id);
        }
      }

      if (text === "تنظیم مدیر" && msg.reply_to_message) {
        const t = msg.reply_to_message.from;
        if (!g.admins.includes(t.id)) g.admins.push(t.id);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "› کاربر ( " + t.first_name + " ) ›› مدیر ربات شد.", msg.message_id);
      }

      if (text === "حذف مدیر" && msg.reply_to_message) {
        const t = msg.reply_to_message.from;
        g.admins = g.admins.filter(id => String(id) !== String(t.id));
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "› کاربر ( " + t.first_name + " ) ›› عزل شد.", msg.message_id);
      }

      if (text === "لیست مدیران" || text === "لیست مدیرها") {
        let listStr = "⚙️ **لیست مدیران ربات:**\n\n";
        for (const aId of g.admins) {
          listStr += "▫️ [کاربر " + aId + "](tg://user?id=" + aId + ")\n";
        }
        return await sendMessage(chatId, listStr, msg.message_id);
      }

      if (text.startsWith("تنظیم قوانین ")) {
        const newRules = text.replace("تنظیم قوانین ", "").trim();
        g.rules = newRules;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ قوانین جدید گروه با موفقیت تنظیم شد.", msg.message_id);
      }

      if (text.startsWith("حذف پیام ")) {
        const numStr = text.replace("حذف پیام ", "").trim();
        const count = parseInt(numStr);
        if (!isNaN(count) && count > 0) {
          const startId = msg.message_id;
          const limit = Math.min(count + 1, 100);
          for (let i = 0; i < limit; i++) {
            await tgCall("deleteMessage", { chat_id: chatId, message_id: startId - i });
          }
          return;
        }
      }

      if (text.startsWith("حذف سکه ")) {
        if (userId !== OWNER_ID) {
          return await sendMessage(chatId, "❌ این دستور فقط مخصوص مالک اصلی ربات است.", msg.message_id);
        }
        const parts = text.replace("حذف سکه ", "").trim().split(/\s+/);
        const targetUserId = parts[0];
        const amount = parseInt(parts[1]);

        if (!targetUserId || isNaN(amount)) {
          return await sendMessage(chatId, "❌ فرمت دستور اشتباه است.\nمثال: `حذف سکه [آیدی_عددی] [تعداد_سکه]`", msg.message_id);
        }

        let targetData = getUserData(cfg, targetUserId);
        targetData.coins = Math.max(0, targetData.coins - amount);
        await saveGlobalConfig(env, cfg);

        await sendMessage(targetUserId, "⚠️ مالک ربات تعداد **" + amount + "** سکه از شما حذف کرد.\n🪙 موجودی جدید: " + targetData.coins + " سکه").catch(() => {});
        return await sendMessage(chatId, "✅ با موفقیت تعداد **" + amount + "** سکه از کاربر `" + targetUserId + "` حذف شد.\nموجودی جدید او: " + targetData.coins, msg.message_id);
      }

      if (text.startsWith("حذف هدیه ")) {
        if (userId !== OWNER_ID) {
          return await sendMessage(chatId, "❌ این دستور فقط مخصوص مالک اصلی ربات است.", msg.message_id);
        }
        const parts = text.replace("حذف هدیه ", "").trim().split(/\s+/);
        const targetUserId = parts[0];
        const giftEmoji = parts[1];

        if (!targetUserId || !giftEmoji) {
          return await sendMessage(chatId, "❌ فرمت دستور اشتباه است.\nمثال: `حذف هدیه [آیدی_عددی] [ایموجی_هدیه]`", msg.message_id);
        }

        let targetData = getUserData(cfg, targetUserId);
        const giftIndex = targetData.gifts.indexOf(giftEmoji);

        if (giftIndex === -1) {
          return await sendMessage(chatId, "❌ این کاربر چنین هدیه‌ای ندارد.", msg.message_id);
        }

        targetData.gifts.splice(giftIndex, 1);
        await saveGlobalConfig(env, cfg);

        await sendMessage(targetUserId, "⚠️ مالک ربات هدیه **" + giftEmoji + "** را از پروفایل شما حذف کرد.").catch(() => {});
        return await sendMessage(chatId, "✅ هدیه **" + giftEmoji + "** از پروفایل کاربر `" + targetUserId + "` حذف شد.", msg.message_id);
      }

      if (text === "لیست سکوت") {
        let mList = "🔇 **لیست افراد در حالت سکوت:**\n\n";
        const keys = Object.keys(g.muted_users);
        if (keys.length === 0) return await sendMessage(chatId, "هیچ کاربری در حالت سکوت نیست.", msg.message_id);
        keys.forEach(uId => { mList += "▫️ [کاربر " + uId + "](tg://user?id=" + uId + ")\n"; });
        return await sendMessage(chatId, mList, msg.message_id);
      }

      if (text === "بن +" && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        await tgCall("banChatMember", { chat_id: chatId, user_id: target.id });
        if (!g.banned_users.includes(target.id)) g.banned_users.push(target.id);
        await saveGroupData(env, chatId, g);
        return;
      }

      if ((text === "بن" || text === "سیک") && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        await tgCall("banChatMember", { chat_id: chatId, user_id: target.id });
        if (!g.banned_users.includes(target.id)) g.banned_users.push(target.id);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "🚫 کاربر ( " + target.first_name + " ) اخراج شد.", msg.message_id);
      }

      if (text === "حذف بن" && msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        await tgCall("unbanChatMember", { chat_id: chatId, user_id: target.id, only_if_banned: true });
        g.banned_users = g.banned_users.filter(id => String(id) !== String(target.id));
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ محرومیت کاربر ( " + target.first_name + " ) لغو شد.", msg.message_id);
      }
    }
  } catch (e) {
    console.error("Handler Error:", e);
  }
}