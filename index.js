const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || "8991397075:AAEXNRuY3RIY2JTNNy0bEJV91zVEzgKcH9w";
const TELEGRAM_API = "https://api.telegram.org/bot" + BOT_TOKEN;
const OWNER_ID = "8854073031";
const BOT_NAME = "𝑬𝟏𝟎 𝑴𝒂𝒏𝒂𝒈𝒆𝒓";
const BOT_USERNAME = "@E10_ManagerBot";
const DEFAULT_CHANNEL = "";

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
        return cfg;
      }
    }
  } catch (e) {}
  return { is_off: false, off_reason: "", bot_admins: [OWNER_ID], private_users: [], banned_pv: [] };
}

async function saveGlobalConfig(env, cfg) {
  try {
    if (env && env.BOT_KV) {
      await env.BOT_KV.put("global_config", JSON.stringify(cfg));
    }
  } catch (e) {}
}

function createNewGroupData(adderId = null) {
  return {
    adder_id: adderId ? String(adderId) : null,
    admins: [],
    members: [],
    member_details: {},
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
    forced_channels: DEFAULT_CHANNEL ? [DEFAULT_CHANNEL] : [],
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
        if (!data.forced_channels) data.forced_channels = DEFAULT_CHANNEL ? [DEFAULT_CHANNEL] : [];
        if (!data.spam_action) data.spam_action = { type: "mute", minutes: 5 };
        if (!data.stats) data.stats = { total: 0, today: 0, date: new Date().toISOString().split('T')[0], user_msg_count: {}, user_names: {} };
        if (!data.stats.user_names) data.stats.user_names = {};
        if (!data.stats.user_msg_count) data.stats.user_msg_count = {};
        if (data.rules === undefined) data.rules = "";
        if (!data.locks) data.locks = {};
        if (data.locks.text === undefined) data.locks.text = false;
        if (data.locks.forward === undefined) data.locks.forward = false;
        if (data.locks.persian === undefined) data.locks.persian = false;
        if (data.locks.english === undefined) data.locks.english = false;
        if (data.locks.edit === undefined) data.locks.edit = false;
        if (data.locks.hashtag === undefined) data.locks.hashtag = false;
        if (data.saved_asl === undefined) data.saved_asl = null;
        if (data.saved_link === undefined) data.saved_link = null;
        if (!Array.isArray(data.members)) data.members = [];
        if (!data.member_details) data.member_details = {};
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
        [{ text: "🎲 سرگرمی و فیلتر", callback_data: "help_fun" }]
      ]
    };
  }
  return { inline_keyboard: [[{ text: "🔙 بازگشت به منوی اصلی", callback_data: "help_main" }]] };
}

function getHelpText(category) {
  switch (category) {
    case "locks": return "🔒 **دستورات قفل و اسپم:**\n\n▫️ `قفل متن` | `قفل عکس` | `قفل گیف` | `قفل استیکر` | `قفل مکان`\n▫️ `قفل فیلم` | `قفل اهنگ` | `قفل لینک` | `قفل ایدی`\n▫️ `قفل فروارد` | `قفل فارسی` | `قفل انگلیسی` | `قفل ویرایش` | `قفل هشتگ`\n▫️ `قفل گروه` | `قفل گروه [ساعت]` | `بازکردن گروه`\n▫️ `تنظیم اسپم [تعداد]` | `تنظیم اسپم غیرفعال`\n▫️ `تنظیم مجازات اسپم [سکوت/بن/اخطار] [دقیقه]`";
    case "punish": return "⚠️ **دستورات اخطار، سنجاق و مجازات:**\n\n▫️ `پین` | `انپین` | `اخطار` | `حذف اخطار`\n▫️ `تنظیم حداکثر اخطار [تعداد]`\n▫️ `تنظیم مجازات اخطار [بن/سکوت]`\n▫️ `سکوت` | `سکوت [دقیقه]` | `حذف سکوت` | `لیست سکوت`\n▫️ `بن` | `حذف بن` | `لیست بن` | `حذف پیام [تعداد]`";
    case "tags": return "🏷 **دستورات لقب، آمار و تگ:**\n\n▫️ `تنظیم لقب [اسم]` | `حذف لقب` | `لقب`\n▫️ `تگ کل` | `تگ مدیران` | `تگ کاربران` | `تگ [متن]`\n▫️ `امار کل` | `امار امروز` | `امار` | `پنل کاربر`";
    case "settings": return "⚙️ **تنظیمات مدیریت و دعوت:**\n\n▫️ `تنظیم قوانین [متن]` | `قوانین`\n▫️ `اد اجباری [تعداد]` | `اد اجباری غیرفعال`\n▫️ `تنظیم عضویت اجباری [يوزر_كانال]`\n▫️ `حذف عضویت اجباری [يوزر_كانال]` | `لیست عضویت اجباری`\n▫️ `تنظیم خوشامد [متن]`\n▫️ `تنظیم مدیر` | `حذف مدیر` | `لیست مدیرها`\n▫️ `ثبت اصل` | `حذف اصل` | `ثبت لینک اینجا` | `حذف لینک اینجا` | `لینک ها`";
    case "fun": return "🎲 **دستورات سرگرمی و فیلترینگ:**\n\n▫️ `تاریخ` | `فال` | `تاس` | `سکه` | `شانس` | `فونت [متن]`\n▫️ `مخفی [متن]` (ارسال و حذف آنی پیام)\n▫️ `پیام [username@] [متن]` (پیام مخفی به کاربر)\n▫️ `تبدیل استیکر به عکس` (ریپلای روی استیکر)\n▫️ `[عدد 1] [عملگر +-*/] [عدد 2]` (ماشین حساب)\n▫️ `فیلتر [کلمه]` | `حذف فیلتر [کلمه]` | `لیست فیلتر`";
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
    [{ text: "🟢 آن‌بن کاربر", callback_data: "unban_user_prompt" }, { text: "📢 پیام همگانی", callback_data: "broadcast_prompt" }]
  ];

  if (userId === OWNER_ID) {
    keyboard.push([{ text: "⚙️ مدیریت (مخصوص مالک)", callback_data: "owner_management" }]);
  }

  keyboard.push([{ text: "🔙 بازگشت", callback_data: "pv_main_menu" }]);
  return { inline_keyboard: keyboard };
}

// Function to update Group Permissions based on Locks (Updated to completely restrict media/photos/stickers natively)
async function updateGroupPermissions(chatId, locks) {
  const canSendMessages = !locks.text;
  const canSendMedia = !locks.photo && !locks.video && !locks.audio;
  const canSendOther = !locks.sticker && !locks.animation && !locks.location;
  const canSendPhotos = !locks.photo;
  const canSendVideos = !locks.video;

  await tgCall("setChatPermissions", {
    chat_id: chatId,
    permissions: {
      can_send_messages: canSendMessages,
      can_send_media_messages: canSendMedia,
      can_send_other_messages: canSendOther,
      can_send_photos: canSendPhotos,
      can_send_videos: canSendVideos,
      can_add_web_page_previews: !locks.link
    }
  });
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
        const channels = g.forced_channels || [];
        
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
            [{ text: "🔙 بازگشت به پنل مدیریت", callback_data: "admin_panel" }]
          ]
        };
        await editMessageText(cb.message.chat.id, cb.message.message_id, listMsg, ownerMarkup);
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
        const editLockText = `🔒 قفل ویرایش فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل ویرایش شدن حذف شد.`;
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
            [{ text: "⚙️ پنل اصلی ادمین", callback_data: "admin_panel" }]
          ]
        };
        return await sendMessage(chatId, listMsg, msg.message_id, ownerPanelMarkup);
      }

      if (text.startsWith("/start")) {
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
        const refText = `👥 **سیستم دعوت دوستان:**\n\n🔗 لینک اختصاصی دعوت شما:\n\`${refLink}\``;
        return await sendMessage(chatId, refText, msg.message_id, getPrivateKeyboard());
      }

      if (text === "📢 کانال ما") {
        return await sendMessage(chatId, "📢 **کانال رسمی ربات:**\n" + (DEFAULT_CHANNEL || "ثبت نشده است"), msg.message_id, getPrivateKeyboard());
      }

      if (text === "➕ افزودن به گپ") {
        const botCleanUsername = BOT_USERNAME.replace("@", "");
        return await sendMessage(chatId, "➕ **جهت افزودن ربات به گروه روی لینک زیر کلیک کنید:**\nhttps://t.me/" + botCleanUsername + "?startgroup=true", msg.message_id, getPrivateKeyboard());
      }

      return;
    }

    let g = await getGroupData(env, chatId);

    // Save user info to member details for accurate user panel and tagging even if message was before bot joined
    if (msg.from) {
      if (!g.members.includes(userId)) g.members.push(userId);
      g.member_details[userId] = {
        id: userId,
        first_name: msg.from.first_name || "کاربر",
        username: msg.from.username ? "@" + msg.from.username : "ندارد"
      };
    }

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
        await updateGroupPermissions(chatId, g.locks);
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
        g.member_details[m.id] = {
          id: String(m.id),
          first_name: m.first_name || "کاربر",
          username: m.username ? "@" + m.username : "ندارد"
        };
        if (!g.members.includes(String(m.id))) g.members.push(String(m.id));

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
        await updateGroupPermissions(chatId, g.locks);
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
        return await sendMessage(chatId, `🔒 قفل فارسی فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل داشتن متن فارسی حذف شد.`);
      }

      if (locks.english && hasEnglish) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, `🔒 قفل انگلیسی فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل داشتن متن انگلیسی حذف شد.`);
      }

      if (locks.hashtag && hasHashtag) {
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return await sendMessage(chatId, `🔒 قفل هشتگ فعال است!\n👤 کاربر: ${userId}\n⚠️ پیام شما به دلیل داشتن هشتگ حذف شد.`);
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

    // User Panel Command (Works on Reply or directly, even before bot joined)
    if (text === "پنل کاربر" || text === "اطلاعات کاربر") {
      let targetUser = msg.from;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }

      const targetId = String(targetUser.id);
      const name = targetUser.first_name || "نامشخص";
      const username = targetUser.username ? "@" + targetUser.username : "ندارد";
      const userWarns = g.warns[targetId] || 0;
      const isMuted = g.muted_users[targetId] ? "بله" : "خیر";

      const panelText = `👤 **پنل اطلاعات کاربر:**\n\n` +
        `▫️ **نام:** ${name}\n` +
        `▫️ **یوزرنیم:** ${username}\n` +
        `▫️ **آیدی عددی:** \`${targetId}\`\n` +
        `▫️ **تعداد اخطارها:** ${userWarns}/${g.max_warns || 3}\n` +
        `▫️ **وضعیت سکوت:** ${isMuted}`;

      return await sendMessage(chatId, panelText, msg.message_id);
    }

    // Tag All Command (Tags every member in group data)
    if (userIsAdmin && (text === "تگ کل" || text.startsWith("تگ کل "))) {
      const customTagMsg = text.replace("تگ کل", "").trim();
      let tagText = "📢 **تگ عمومی اعضای گروه:**\n" + (customTagMsg ? customTagMsg + "\n\n" : "\n");
      
      const allMembers = g.members || [];
      allMembers.forEach(memId => {
        const detail = g.member_details[memId];
        const memName = detail ? detail.first_name : "کاربر";
        tagText += `[${memName}](tg://user?id=${memId}) `;
      });

      return await sendMessage(chatId, tagText, msg.message_id);
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
          const map = {a:"𝖆",b:"𝖇",c:"𝖈",d:"𝖉",e:"𝖊",f:"𝖋",g:"𝖌",h:"𝍀",i:"𝖎",j:"𝖏",k:"𝖐",l:"𝖑",m:"𝖒",n:"𝖓",o:"𝖔",p:"𝖕",q:"𝖖",r:"𝖗",s:"𝖘",t:"𝖙",u:"𝖚",v:"𝖛",w:"𝖜",x:"𝖞",z:"𝖟"};
          return map[c.toLowerCase()] || c;
        }).join(""),
        wordToFont.split("").map(c => {
          const map = {a:"Ⓐ",b:"Ⓑ",c:"Ⓒ",d:"Ⓓ",e:"Ⓔ",f:"Ⓕ",g:"Ⓖ",h:"Ⓗ",i:"Ⓘ",j:"Ⓙ",k:"Ⓚ",l:"Ⓛ",m:"Ⓜ",n:"Ⓝ",o:"Ⓞ",p:"Ⓟ",q:"Ⓠ",r:"Ⓡ",s:"Ⓢ",t:"Ⓣ",u:"Ⓤ",v:"Ⓥ",w:"Ⓦ",x:"Ⓧ",y:"Ⓨ",z:"Ⓩ"};
          return map[c.toLowerCase()] || c;
        }).join(""),
        wordToFont.split("").map(c => {
          const map = {a:"ᵃ",b:"ᵇ",c:"ᶜ",d:"ᵈ",e:"ᵉ",f:"ᶠ",g:"ᵍ",h:"ʰ",i:"ⁱ",j:"ʲ",k:"ᵏ",l:"ˡ",m:"ᵐ",n:"ⁿ",o:"ᵒ",p:"ᵖ",q:"ʲ",r:"ʳ",s:"ˢ",t:"ᵗ",u:"ᵘ",v:"ᵛ",w:"ʷ",x:"ˣ",y:"ʸ",z:"ᶻ"};
          return map[c.toLowerCase()] || c;
        }).join("")
      ];
      let fontResult = "✨ **فونت‌های ساخته شده:**\n\n";
      fonts.forEach((f, idx) => { fontResult += (idx + 1) + ". `" + f + "`\n"; });
      return await sendMessage(chatId, fontResult, msg.message_id);
    }

    if (text.startsWith("مخفی ")) {
      const secretMsg = text.replace("مخفی ", "").trim();
      await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      const sentMsg = await sendMessage(chatId, "🤫 **پیام مخفی:**\n" + secretMsg);
      if (sentMsg.ok && sentMsg.result && sentMsg.result.message_id) {
        setTimeout(async () => {
          await tgCall("deleteMessage", { chat_id: chatId, message_id: sentMsg.result.message_id });
        }, 3000);
      }
      return;
    }

    if (text.startsWith("پیام @")) {
      const parts = text.split(" ");
      if (parts.length >= 3) {
        const targetUser = parts[1];
        const secretContent = parts.slice(2).join(" ");
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        
        const secretKey = Date.now() + "_" + Math.floor(Math.random() * 10000);
        if (env && env.BOT_KV) {
          await env.BOT_KV.put("secret:" + secretKey, secretContent);
        }

        const inlineMarkup = {
          inline_keyboard: [[{ text: "📩 نمایش پیام", callback_data: "secret_" + targetUser.replace("@", "") + "_" + secretKey }]]
        };
        return await sendMessage(chatId, "🤫 یک پیام مخفی برای " + targetUser + " ارسال شد!", null, inlineMarkup);
      }
    }

    if (text === "ثبت اصل" && msg.reply_to_message) {
      if (!userIsAdmin) return await sendMessage(chatId, "شما دسترسی ندارید.", msg.message_id);
      g.saved_asl = msg.reply_to_message.text || "";
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "اصل ثبت شد.", msg.message_id);
    }

    if (text === "حذف اصل") {
      if (!userIsAdmin) return await sendMessage(chatId, "شما دسترسی ندارید.", msg.message_id);
      g.saved_asl = null;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "اصل حذف شد.", msg.message_id);
    }

    if (text === "اصل" || text === "اصل؟") {
      if (g.saved_asl) {
        return await sendMessage(chatId, g.saved_asl, msg.message_id);
      } else {
        return await sendMessage(chatId, "اصلی ثبت نشده است.", msg.message_id);
      }
    }

    if (text === "ثبت لینک اینجا" && msg.reply_to_message) {
      if (!userIsAdmin) return await sendMessage(chatId, "شما دسترسی ندارید.", msg.message_id);
      g.saved_link = msg.reply_to_message.text || "";
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "لینک ثبت شد.", msg.message_id);
    }

    if (text === "حذف لینک اینجا") {
      if (!userIsAdmin) return await sendMessage(chatId, "شما دسترسی ندارید.", msg.message_id);
      g.saved_link = null;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "لینک حذف شد.", msg.message_id);
    }

    if (text === "لینک" || text === "لینک ها") {
      if (g.saved_link) {
        return await sendMessage(chatId, g.saved_link, msg.message_id);
      } else {
        return await sendMessage(chatId, "لینکی ثبت نشده است.", msg.message_id);
      }
    }

    if (userIsAdmin) {
      if (text.startsWith("فیلتر ")) {
        const filterWord = text.replace("فیلتر ", "").trim();
        if (filterWord) {
          g.filtered_words[filterWord] = true;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, `✅ کلمه **${filterWord}** به لیست فیلتر اضافه شد.`, msg.message_id);
        }
      }

      if (text.startsWith("حذف فیلتر ")) {
        const filterWord = text.replace("حذف فیلتر ", "").trim();
        if (filterWord && g.filtered_words[filterWord]) {
          delete g.filtered_words[filterWord];
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, `✅ کلمه **${filterWord}** از لیست فیلتر حذف شد.`, msg.message_id);
        }
      }

      if (text === "لیست فیلتر") {
        const wordList = Object.keys(g.filtered_words);
        if (wordList.length === 0) {
          return await sendMessage(chatId, "📋 لیست فیلتر خالی است.", msg.message_id);
        }
        let listText = "📋 **کلمات فیلتر شده:**\n\n";
        wordList.forEach((w, idx) => { listText += (idx + 1) + ". `" + w + "`\n"; });
        return await sendMessage(chatId, listText, msg.message_id);
      }

      if (text.startsWith("تنظیم اسپم ") || text.startsWith("اسپم ")) {
        const valStr = text.replace("تنظیم اسپم ", "").replace("اسپم ", "").trim();
        if (valStr === "غیرفعال") {
          g.spam_limit = 0;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ قفل اسپم غیرفعال شد.", msg.message_id);
        }
        const val = parseInt(valStr);
        if (!isNaN(val) && val > 0) {
          g.spam_limit = val;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ حد مجاز اسپم به **" + val + "** پیام در ۵ ثانیه تغییر یافت.", msg.message_id);
        }
      }

      if (text.startsWith("تنظیم مجازات اسپم ")) {
        const parts = text.replace("تنظیم مجازات اسپم ", "").trim().split(" ");
        const actType = parts[0];
        const mins = parts[1] ? parseInt(parts[1]) : 5;
        if (actType === "سکوت") {
          g.spam_action = { type: "mute", minutes: mins };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات اسپم به **سکوت (" + mins + " دقیقه)** تغییر یافت.", msg.message_id);
        } else if (actType === "بن") {
          g.spam_action = { type: "ban", minutes: 0 };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات اسپم به **بن (اخراج)** تغییر یافت.", msg.message_id);
        } else if (actType === "اخطار") {
          g.spam_action = { type: "warn", minutes: 0 };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات اسپم به **اخطار** تغییر یافت.", msg.message_id);
        }
      }

      if (text.startsWith("اد اجباری ") || text.startsWith("تنظیم اد ")) {
        const valStr = text.replace("اد اجباری ", "").replace("تنظیم اد ", "").trim();
        if (valStr === "غیرفعال") {
          g.req_adds = 0;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ اد اجباری غیرفعال شد.", msg.message_id);
        }
        const val = parseInt(valStr);
        if (!isNaN(val) && val >= 0) {
          g.req_adds = val;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ تعداد اد اجباری به **" + val + "** نفر تغییر یافت.", msg.message_id);
        }
      }

      if (text.startsWith("تنظیم عضویت اجباری ")) {
        const channelName = text.replace("تنظیم عضویت اجباری ", "").trim();
        if (channelName.startsWith("@")) {
          if (!g.forced_channels) g.forced_channels = [];
          if (!g.forced_channels.includes(channelName)) {
            g.forced_channels.push(channelName);
            await saveGroupData(env, chatId, g);
          }
          return await sendMessage(chatId, "✅ کانال **" + channelName + "** به لیست قفل عضویت اضافه شد.", msg.message_id);
        }
      }

      if (text.startsWith("حذف عضویت اجباری ")) {
        const channelName = text.replace("حذف عضویت اجباری ", "").trim();
        if (g.forced_channels) {
          g.forced_channels = g.forced_channels.filter(ch => ch !== channelName);
          await saveGroupData(env, chatId, g);
        }
        return await sendMessage(chatId, "✅ کانال **" + channelName + "** از لیست قفل عضویت حذف شد.", msg.message_id);
      }

      if (text === "لیست عضویت اجباری") {
        const channels = g.forced_channels || [];
        if (channels.length === 0) {
          return await sendMessage(chatId, "📋 هیچ کانالی برای قفل عضویت ثبت نشده است.", msg.message_id);
        }
        let listText = "📋 **لیست کانال‌های عضویت اجباری:**\n\n";
        channels.forEach((ch, idx) => { listText += (idx + 1) + ". " + ch + "\n"; });
        return await sendMessage(chatId, listText, msg.message_id);
      }

      if (text.startsWith("حذف پیام ")) {
        const numStr = text.replace("حذف پیام ", "").trim();
        const count = parseInt(numStr);
        if (!isNaN(count) && count > 0 && count <= 100) {
          const currentMsgId = msg.message_id;
          for (let i = 0; i < count; i++) {
            await tgCall("deleteMessage", { chat_id: chatId, message_id: currentMsgId - i });
          }
          const delNotify = await sendMessage(chatId, "🗑 **تعداد " + count + " پیام اخیر با موفقیت حذف شدند.**");
          if (delNotify.ok && delNotify.result && delNotify.result.message_id) {
            setTimeout(async () => {
              await tgCall("deleteMessage", { chat_id: chatId, message_id: delNotify.result.message_id });
            }, 3000);
          }
          return;
        }
      }

      if (text.startsWith("تنظیم مدیر") && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        if (!g.admins.includes(targetId)) {
          g.admins.push(targetId);
          await saveGroupData(env, chatId, g);
        }
        return await sendMessage(chatId, "✅ کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") به مدیران گروه اضافه شد.", msg.message_id);
      }

      if (text.startsWith("حذف مدیر") && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        g.admins = g.admins.filter(a => String(a) !== targetId);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") از مدیران گروه حذف شد.", msg.message_id);
      }

      if (text === "لیست مدیرها" || text === "مدیران") {
        let adminListText = "👮‍♂️ **لیست مدیران گروه:**\n\n";
        adminListText += "👑 مالک: [" + (g.adder_id || OWNER_ID) + "](tg://user?id=" + (g.adder_id || OWNER_ID) + ")\n";
        g.admins.forEach((adm, idx) => {
          adminListText += (idx + 1) + ". [" + adm + "](tg://user?id=" + adm + ")\n";
        });
        return await sendMessage(chatId, adminListText, msg.message_id);
      }

      if (text === "پین" && msg.reply_to_message) {
        await tgCall("pinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        return await sendMessage(chatId, "📌 پیام با موفقیت سنجاق شد.", msg.message_id);
      }

      if (text === "انپین" || text === "آنپین") {
        await tgCall("unpinChatMessage", { chat_id: chatId });
        return await sendMessage(chatId, "📌 پیام از سنجاق خارج شد.", msg.message_id);
      }

      if (text.startsWith("تنظیم خوشامد ")) {
        g.welcome_text = text.replace("تنظیم خوشامد ", "").trim();
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ متن خوشامدگویی با موفقیت آپدیت شد.", msg.message_id);
      }

      if (text.startsWith("تنظیم قوانین ")) {
        g.rules = text.replace("تنظیم قوانین ", "").trim();
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ قوانین گروه آپدیت شد.", msg.message_id);
      }

      if (text === "قوانین") {
        const rulesText = (g.rules && g.rules.trim() !== "") ? g.rules : "قوانینی ثبت نشده است.";
        return await sendMessage(chatId, "📜 **قوانین گروه:**\n\n" + rulesText, msg.message_id);
      }

      if (text.startsWith("تنظیم لقب ") && msg.reply_to_message) {
        const nick = text.replace("تنظیم لقب ", "").trim();
        const targetId = String(msg.reply_to_message.from.id);
        g.nicknames[targetId] = nick;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ لقب کاربر به **" + nick + "** تغییر یافت.", msg.message_id);
      }

      if (text === "حذف لقب" && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        delete g.nicknames[targetId];
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ لقب کاربر حذف شد.", msg.message_id);
      }

      if (text === "لقب") {
        const targetId = msg.reply_to_message ? String(msg.reply_to_message.from.id) : userId;
        const nick = g.nicknames[targetId] || "لقبی ثبت نشده است.";
        return await sendMessage(chatId, "🏷 **لقب کاربر:** " + nick, msg.message_id);
      }

      if (text === "اخطار" && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        const currentWarns = (g.warns[targetId] || 0) + 1;
        g.warns[targetId] = currentWarns;
        await saveGroupData(env, chatId, g);

        const maxW = g.max_warns || 3;
        if (currentWarns >= maxW) {
          g.warns[targetId] = 0;
          await saveGroupData(env, chatId, g);
          if (g.warn_action === "ban") {
            await tgCall("banChatMember", { chat_id: chatId, user_id: targetId });
            return await sendMessage(chatId, "⚠️ کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") به دلیل دریافت حداکثر اخطار (" + maxW + ") اخراج شد.");
          } else {
            const expireTime = Date.now() + 60 * 60 * 1000;
            g.muted_users[targetId] = expireTime;
            await saveGroupData(env, chatId, g);
            await tgCall("restrictChatMember", { chat_id: chatId, user_id: targetId, permissions: { can_send_messages: false }, until_date: Math.floor(expireTime / 1000) });
            return await sendMessage(chatId, "🔇 کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") به دلیل دریافت حداکثر اخطار (" + maxW + ") به مدت **۱ ساعت** مسدود شد.");
          }
        }
        return await sendMessage(chatId, "⚠️ کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") یک اخطار دریافت کرد. (" + currentWarns + "/" + maxW + ")", msg.message_id);
      }

      if (text === "حذف اخطار" && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        g.warns[targetId] = 0;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ اخطارهای کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") صفر شد.", msg.message_id);
      }

      if (text.startsWith("تنظیم حداکثر اخطار ")) {
        const val = parseInt(text.replace("تنظیم حداکثر اخطار ", "").trim());
        if (!isNaN(val) && val > 0) {
          g.max_warns = val;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ حداکثر اخطار به **" + val + "** تغییر یافت.", msg.message_id);
        }
      }

      if (text.startsWith("تنظیم مجازات اخطار ")) {
        const act = text.replace("تنظیم مجازات اخطار ", "").trim();
        if (act === "بن" || act === "سکوت") {
          g.warn_action = act === "بن" ? "ban" : "mute";
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات حداکثر اخطار به **" + act + "** تغییر یافت.", msg.message_id);
        }
      }

      if (text.startsWith("سکوت") && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        const parts = text.split(" ");
        let mins = 0;
        if (parts.length > 1) mins = parseInt(parts[1]) || 0;

        const expireTime = mins > 0 ? Date.now() + mins * 60 * 1000 : "perm";
        g.muted_users[targetId] = expireTime;
        await saveGroupData(env, chatId, g);

        const untilDateParam = mins > 0 ? Math.floor(expireTime / 1000) : 0;
        await tgCall("restrictChatMember", { chat_id: chatId, user_id: targetId, permissions: { can_send_messages: false }, until_date: untilDateParam });

        const timeText = mins > 0 ? "به مدت **" + mins + " دقیقه**" : "به صورت **دائمی**";
        return await sendMessage(chatId, "🔇 کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") " + timeText + " مسدود شد.", msg.message_id);
      }

      if (text === "حذف سکوت" && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        delete g.muted_users[targetId];
        await saveGroupData(env, chatId, g);
        await updateGroupPermissions(chatId, g.locks);
        return await sendMessage(chatId, "🔊 کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") از حالت سکوت خارج شد.", msg.message_id);
      }

      if (text === "لیست سکوت") {
        let muteList = "🔇 **لیست کاربران در حالت سکوت:**\n\n";
        const muted = Object.keys(g.muted_users);
        if (muted.length === 0) return await sendMessage(chatId, "هیچ کاربری در حالت سکوت نیست.", msg.message_id);
        muted.forEach((u, i) => { muteList += (i + 1) + ". [" + u + "](tg://user?id=" + u + ")\n"; });
        return await sendMessage(chatId, muteList, msg.message_id);
      }

      if ((text === "بن" || text === "بن +" || text === "سیک") && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        await tgCall("banChatMember", { chat_id: chatId, user_id: targetId });
        if (!g.banned_users.includes(targetId)) g.banned_users.push(targetId);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "🚫 کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") با موفقیت از گروه بن شد.", msg.message_id);
      }

      if (text === "حذف بن" && msg.reply_to_message) {
        const targetId = String(msg.reply_to_message.from.id);
        await tgCall("unbanChatMember", { chat_id: chatId, user_id: targetId, only_if_banned: true });
        g.banned_users = g.banned_users.filter(u => u !== targetId);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "🟢 کاربر [" + msg.reply_to_message.from.first_name + "](tg://user?id=" + targetId + ") آن‌بن شد.", msg.message_id);
      }

      if (text === "لیست بن") {
        let banList = "🚫 **لیست کاربران بن‌شده:**\n\n";
        if (g.banned_users.length === 0) return await sendMessage(chatId, "هیچ کاربری بن نشده است.", msg.message_id);
        g.banned_users.forEach((u, i) => { banList += (i + 1) + ". [" + u + "](tg://user?id=" + u + ")\n"; });
        return await sendMessage(chatId, banList, msg.message_id);
      }

      if (text === "قفل گروه") {
        g.group_lock_until = null;
        g.locks.text = true;
        await saveGroupData(env, chatId, g);
        await updateGroupPermissions(chatId, g.locks);
        return await sendMessage(chatId, "🔒 **گروه قفل شد. پیام دادن مسدود است.**", msg.message_id);
      }

      if (text.startsWith("قفل گروه ")) {
        const hours = parseInt(text.replace("قفل گروه ", "").trim());
        if (!isNaN(hours) && hours > 0) {
          g.group_lock_until = Date.now() + hours * 60 * 60 * 1000;
          g.locks.text = true;
          await saveGroupData(env, chatId, g);
          await updateGroupPermissions(chatId, g.locks);
          return await sendMessage(chatId, "🔒 **گروه به مدت " + hours + " ساعت قفل شد.**", msg.message_id);
        }
      }

      if (text === "بازکردن گروه") {
        g.group_lock_until = null;
        g.locks.text = false;
        await saveGroupData(env, chatId, g);
        await updateGroupPermissions(chatId, g.locks);
        return await sendMessage(chatId, "🔓 **گروه باز شد. اکنون اعضا می‌توانند چت کنند.**", msg.message_id);
      }

      // Lock Commands modifying global chat permissions so users cannot even attempt typing/sending media
      if (text.startsWith("قفل ") || text.startsWith("بازکردن ")) {
        const isLock = text.startsWith("قفل ");
        const target = text.replace("قفل ", "").replace("بازکردن ", "").trim();

        const lockMap = {
          "متن": "text", "عکس": "photo", "فیلم": "video", "اهنگ": "audio",
          "مکان": "location", "استیکر": "sticker", "گیف": "animation",
          "لینک": "link", "ایدی": "username", "فروارد": "forward",
          "فارسی": "persian", "انگلیسی": "english", "ویرایش": "edit", "هشتگ": "hashtag"
        };

        if (lockMap[target]) {
          const key = lockMap[target];
          g.locks[key] = isLock;
          await saveGroupData(env, chatId, g);
          await updateGroupPermissions(chatId, g.locks);
          const stateStr = isLock ? "🔒 قفل شد (ارسال کلا مسدود گردید)." : "🔓 باز شد.";
          return await sendMessage(chatId, `دستور **${target}** با موفقیت ${stateStr}`, msg.message_id);
        }
      }

      if (text === "راهنما" || text === "پنل") {
        return await sendMessage(chatId, getHelpText("main"), msg.message_id, getHelpKeyboard("main"));
      }

      if (text === "امار" || text === "آمار") {
        const statsMsg = "📊 **آمار فعالیت گروه:**\n\n▫️ پیام‌های امروز: **" + g.stats.today + "**\n▫️ کل پیام‌های ثبت‌شده: **" + g.stats.total + "**";
        return await sendMessage(chatId, statsMsg, msg.message_id);
      }

      if (text === "امار کل" || text === "آمار کل") {
        let statsMsg = "📊 **آمار کل چت اعضا:**\n\n";
        const sorted = Object.entries(g.stats.user_msg_count).sort((a, b) => b[1] - a[1]);
        sorted.slice(0, 15).forEach(([uId, cnt], i) => {
          const uName = g.stats.user_names[uId] || "کاربر";
          statsMsg += (i + 1) + ". [" + uName + "](tg://user?id=" + uId + "): **" + cnt + "** پیام\n";
        });
        return await sendMessage(chatId, statsMsg, msg.message_id);
      }
    }
  } catch (err) {
    console.error("HandleUpdate error:", err);
  }
}
