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

// Simple JSON Database file emulation for Volume storage
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
    saved_uids: {},
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
        if (!data.saved_uids) data.saved_uids = {};
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
    case "tags": return "🏷 **دستورات لقب، آمار و تگ:**\n\n▫️ `تنظیم لقب [اسم]` | `حذف لقب` | `لقب`\n▫️ `ثبت یوایدی [متن]` (ریپلی روی کاربر)\n▫️ `تگ کل` | `تگ مدیران` | `تگ کاربران` | `تگ [متن]`\n▫️ `امار کل` | `امار امروز` | `امار` | `پنل کاربر`";
    case "settings": return "⚙️ **تنظیمات مدیریت و دعوت:**\n\n▫️ `تنظیم قوانین [متن]` | `قوانین`\n▫️ `اد اجباری [تعداد]` | `اد اجباری غیرفعال`\n▫️ `تنظیم عضویت اجباری [يوزر_كانال]`\n▫️ `حذف عضویت اجباری [يوزر_كانال]` | `لیست عضویت اجباری`\n▫️ `تنظیم خوشامد [متن]`\n▫️ `تنظیم مدیر` | `حذف مدیر` | `لیست مدیرها`\n▫️ `ثبت اصل` | `حذف اصل` | `ثبت لینک اینجا` | `حذف لینک اینجا` | `لینک ها`";
    case "fun": return "🎲 **دستورات سرگرمی و فیلترینگ:**\n\n▫️ `تاریخ` | `فال` | `تاس` | `سکه` | `شانس` | `فونت [متن]`\n▫️ `مخفی [متن]` (ارسال و حذف آنی پیام)\n▫️ `پیام [username@] [متن]` (پیام مخفی به کاربر)\n▫️ `[عدد 1] [عملگر +-*/] [عدد 2]` (ماشین حساب)\n▫️ `فیلتر [کلمه]` | `حذف فیلتر [کلمه]` | `لیست فیلتر`";
    default: return "📚 **به پنل راهنمای مدیریت گروه خوش آمدید.**\n\nیک بخش را انتخاب کنید:";
  }
}

function getPrivateKeyboard() {
  const cleanUsername = BOT_USERNAME.replace("@", "");
  const keyboard = [
    [{ text: "➕ افزودن به گروه", url: `https://t.me/${cleanUsername}?startgroup=true` }]
  ];
  return { inline_keyboard: keyboard };
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
    [{ text: "🟢 آن‌بن کاربر", callback_data: "unban_user_prompt" }, { text: "📢 پیام همگانی (پیوی)", callback_data: "broadcast_prompt" }],
    [{ text: "📢 پیام همگانی (گروه‌ها)", callback_data: "broadcast_groups_prompt" }]
  ];

  if (userId === OWNER_ID) {
    keyboard.push([{ text: "⚙️ مدیریت (مخصوص مالک)", callback_data: "owner_management" }]);
  }

  keyboard.push([{ text: "🔙 بازگشت", callback_data: "pv_main_menu" }]);
  return { inline_keyboard: keyboard };
}

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

      if (data === "pv_main_menu") {
        const startMsg = "خوش اومدید به ربات " + BOT_NAME;
        await editMessageText(cb.message.chat.id, cb.message.message_id, startMsg, getPrivateKeyboard());
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

        const ownerMarkup = {
          inline_keyboard: [
            [{ text: "🚫 بن کاربر", callback_data: "ban_user_prompt" }, { text: "🟢 آن‌بن کاربر", callback_data: "unban_user_prompt" }],
            [{ text: "📢 پیام همگانی (گروه‌ها)", callback_data: "broadcast_groups_prompt" }],
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
        await editMessageText(cb.message.chat.id, cb.message.message_id, "📢 **متن یا پیام همگانی خود برای کاربران (پیوی) را بفرستید:**");
        return await answerCallbackQuery(cb.id);
      }

      if (data === "broadcast_groups_prompt") {
        if (userId !== OWNER_ID && !isOwnerOrAdmin) return await answerCallbackQuery(cb.id, "عدم دسترسی", true);
        if (env && env.BOT_KV) await env.BOT_KV.put("await_action:" + userId, "await_broadcast_groups");
        await editMessageText(cb.message.chat.id, cb.message.message_id, "📢 **متن یا پیام همگانی خود را برای ارسال به تمامی گروه‌ها بفرستید:**");
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

          return await sendMessage(chatId, "🔴 **ربات خاموش شد و پیام اطلاعیه به تمام کاربران ارسال گردید.**", null, getAdminPanelKeyboard(true, userId));
        }

        if (currentAction === "await_add_admin") {
          if (!cfg.bot_admins) cfg.bot_admins = [OWNER_ID];
          if (!cfg.bot_admins.includes(text)) cfg.bot_admins.push(text);
          await saveGlobalConfig(env, cfg);
          return await sendMessage(chatId, "✅ کاربر `" + text + "` با موفقیت به ادمین‌های ربات اضافه شد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
        }

        if (currentAction === "await_rem_admin") {
          if (text === OWNER_ID) return await sendMessage(chatId, "❌ امکان حذف مالک اصلی ربات وجود ندارد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
          cfg.bot_admins = (cfg.bot_admins || []).filter(a => String(a) !== text);
          await saveGlobalConfig(env, cfg);
          return await sendMessage(chatId, "✅ کاربر `" + text + "` از لیست مدیران ربات حذف شد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
        }

        if (currentAction === "await_ban_user") {
          if (!cfg.banned_pv) cfg.banned_pv = [];
          if (!cfg.banned_pv.includes(text)) cfg.banned_pv.push(text);
          await saveGlobalConfig(env, cfg);
          await sendMessage(text, "🔴 **شما توسط مدیریت از ربات بن شدید.**").catch(() => {});
          return await sendMessage(chatId, "✅ کاربر `" + text + "` بن شد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
        }

        if (currentAction === "await_unban_user") {
          cfg.banned_pv = (cfg.banned_pv || []).filter(u => String(u) !== text);
          await saveGlobalConfig(env, cfg);
          await sendMessage(text, "🟢 **حساب شما در ربات آن‌بن شد.**").catch(() => {});
          return await sendMessage(chatId, "✅ کاربر `" + text + "` آن‌بن شد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
        }

        if (currentAction === "await_broadcast") {
          const users = cfg.private_users || [];
          let count = 0;
          const broadMsg = `👑 پیام از مالک ${BOT_NAME}\n\n${text}\n\nممنون که کنارمون هستید ❤️\n— مدیریت ${BOT_NAME}`;
          for (const u of users) {
            const r = await sendMessage(u, broadMsg);
            if (r.ok) count++;
          }
          return await sendMessage(chatId, "✅ پیام همگانی با موفقیت برای **" + count + "** کاربر ارسال شد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
        }

        if (currentAction === "await_broadcast_groups") {
          const groupKeys = Object.keys(dbData.groups || {});
          let count = 0;
          const broadMsg = `${text}`;
          for (const key of groupKeys) {
            const groupChatId = key.replace("group:", "");
            const r = await sendMessage(groupChatId, broadMsg);
            if (r.ok) count++;
          }
          return await sendMessage(chatId, "✅ پیام همگانی با موفقیت برای **" + count + "** گروه ارسال شد.", null, getAdminPanelKeyboard(cfg.is_off, userId));
        }
      }

      if (text === "/admin") {
        if (userId !== OWNER_ID) {
          return await sendMessage(chatId, "❌ این دستور فقط مخصوص مالک ربات است.", msg.message_id);
        }
        const panelText = "⚙️ **پنل مدیریت ربات " + BOT_NAME + "**\n\nوضعیت فعلی ربات: " + (cfg.is_off ? "🔴 خاموش" : "🟢 روشن");
        return await sendMessage(chatId, panelText, msg.message_id, getAdminPanelKeyboard(cfg.is_off, userId));
      }

      if (text.startsWith("/start")) {
        if (text === "panel" || text === "پنل") {
          if (isOwnerOrAdmin) {
            const panelText = "⚙️ **پنل مدیریت ربات " + BOT_NAME + "**\n\nوضعیت فعلی ربات: " + (cfg.is_off ? "🔴 خاموش" : "🟢 روشن");
            return await sendMessage(chatId, panelText, msg.message_id, getAdminPanelKeyboard(cfg.is_off, userId));
          }
        }

        const startMsg = "خوش اومدید به ربات " + BOT_NAME;
        return await sendMessage(chatId, startMsg, msg.message_id, getPrivateKeyboard());
      }

      return;
    }

    let g = await getGroupData(env, chatId);

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
        await tgCall("restrictChatMember", {
          chat_id: chatId,
          user_id: userId,
          permissions: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true
          }
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

      if (locks.text && msg.text) {
        return await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      }

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

    // دستور ثبت یوایدی روی کاربر (فقط مدیران)
    if (userIsAdmin && text.startsWith("ثبت یوایدی")) {
      if (msg.reply_to_message && msg.reply_to_message.from) {
        const targetUser = msg.reply_to_message.from;
        const uidText = text.replace("ثبت یوایدی", "").trim() || String(targetUser.id);
        
        if (!g.saved_uids) g.saved_uids = {};
        g.saved_uids[targetUser.id] = {
          name: targetUser.first_name || "کاربر",
          val: uidText
        };
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ یوایدی کاربر [" + targetUser.first_name + "](tg://user?id=" + targetUser.id + ") با مقدار `" + uidText + "` ثبت شد.", msg.message_id);
      } else {
        return await sendMessage(chatId, "⚠️ برای ثبت یوایدی باید دستور را روی پیام کاربر مورد نظر ریپلی کنید.", msg.message_id);
      }
    }

    // عمومی: مشاهده لیست یوایدی‌ها (برای همه اعضا)
    if (text === "یوایدی" || text === "یو ایدیا" || text === "لیست یوایدی") {
      const uids = g.saved_uids || {};
      const keys = Object.keys(uids);
      if (keys.length === 0) {
        return await sendMessage(chatId, "🆔 هیچ یوایدی تا کنون ثبت نشده است.", msg.message_id);
      }
      let uidMsg = "🆔 **لیست یوایدی‌های ثبت‌شده گروه:**\n\n";
      keys.forEach((k, i) => {
        const uItem = uids[k];
        uidMsg += (i + 1) + ". [" + uItem.name + "](tg://user?id=" + k + ") 👈 `" + uItem.val + "`\n";
      });
      return await sendMessage(chatId, uidMsg, msg.message_id);
    }

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
      const customUid = (g.saved_uids && g.saved_uids[targetId]) ? g.saved_uids[targetId].val : "ثبت نشده";

      const panelText = `👤 **پنل اطلاعات کاربر:**\n\n` +
        `▫️ **نام:** ${name}\n` +
        `▫️ **یوزرنیم:** ${username}\n` +
        `▫️ **آیدی عددی:** \`${targetId}\`\n` +
        `▫️ **یوایدی ثبت‌شده:** \`${customUid}\`\n` +
        `▫️ **تعداد اخطارها:** ${userWarns}/${g.max_warns || 3}\n` +
        `▫️ **وضعیت سکوت:** ${isMuted}`;

      return await sendMessage(chatId, panelText, msg.message_id);
    }

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
          const map = {a:"🇦",b:"🇧",c:"🇨",d:"🇩",e:"🇪",f:"🇫",g:"🇬",h:"🇭",i:"🇮",j:"🇯",k:"🇰",l:"🇱",m:"🇲",n:"🇳",o:"🇴",p:"🇵",q:"🇶",r:"🇷",s:"🇸",t:"🇹",u:"🇺",v:"🇻",w:"🇼",x:"🇽",y:"🇾",z:"🇿"};
          return map[c.toLowerCase()] || c;
        }).join(" "),
        `<b>${wordToFont}</b>`,
        `<i>${wordToFont}</i>`,
        `<code>${wordToFont}</code>`
      ];
      return await sendMessage(chatId, "🔤 **فونت‌های ساخت‌شده:**\n\n1️⃣ " + fonts[0] + "\n2️⃣ " + fonts[1] + "\n3️⃣ " + fonts[2] + "\n4️⃣ " + fonts[3], msg.message_id);
    }

    if (text.startsWith("مخفی ")) {
      const secretMsg = text.replace("مخفی ", "").trim();
      await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      const sentSecret = await sendMessage(chatId, "🤫 **پیام مخفی:**\n\n||" + secretMsg + "||");
      return sentSecret;
    }

    if (text.startsWith("پیام @")) {
      const parts = text.split(" ");
      if (parts.length >= 3) {
        const targetUsername = parts[1].replace("@", "");
        const secretContent = parts.slice(2).join(" ");
        await tgCall("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        
        const secretKey = Date.now() + "_" + Math.floor(Math.random() * 1000);
        if (env && env.BOT_KV) {
          await env.BOT_KV.put("secret:" + secretKey, secretContent);
        }

        const inlineBtn = {
          inline_keyboard: [[{ text: "🔐 مشاهده پیام مخفی", callback_data: `secret_${targetUsername}_${secretKey}` }]]
        };
        return await sendMessage(chatId, `✉️ یک پیام مخفی برای کاربر @${targetUsername} ارسال شد.`, null, inlineBtn);
      }
    }

    if (userIsAdmin && text.startsWith("فیلتر ")) {
      const wordToFilter = text.replace("فیلتر ", "").trim();
      if (wordToFilter) {
        if (!g.filtered_words) g.filtered_words = {};
        g.filtered_words[wordToFilter] = true;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کلمه **" + wordToFilter + "** به لیست کلمات فیلترشده اضافه شد.", msg.message_id);
      }
    }

    if (userIsAdmin && text.startsWith("حذف فیلتر ")) {
      const wordToUnfilter = text.replace("حذف فیلتر ", "").trim();
      if (wordToUnfilter && g.filtered_words && g.filtered_words[wordToUnfilter]) {
        delete g.filtered_words[wordToUnfilter];
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کلمه **" + wordToUnfilter + "** از لیست فیلتر خارج شد.", msg.message_id);
      }
    }

    if (userIsAdmin && text === "لیست فیلتر") {
      const fWords = Object.keys(g.filtered_words || {});
      if (fWords.length === 0) {
        return await sendMessage(chatId, "هیچ کلمه‌ای در لیست فیلتر وجود ندارد.", msg.message_id);
      }
      let fListText = "📝 **لیست کلمات فیلترشده:**\n\n";
      fWords.forEach((w, i) => { fListText += (i + 1) + ". `" + w + "`\n"; });
      return await sendMessage(chatId, fListText, msg.message_id);
    }

    if (userIsAdmin && text.startsWith("تنظیم لقب ")) {
      let targetUser = msg.from;
      let nickname = text.replace("تنظیم لقب ", "").trim();

      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }

      if (nickname) {
        g.nicknames[targetUser.id] = nickname;
        await saveGroupData(env, chatId, g);

        await tgCall("promoteChatMember", {
          chat_id: chatId,
          user_id: targetUser.id,
          can_manage_chat: false,
          can_delete_messages: false,
          can_manage_video_chats: false,
          can_restrict_members: false,
          can_promote_members: false,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false
        });

        const res = await tgCall("setChatAdministratorCustomTitle", {
          chat_id: chatId,
          user_id: targetUser.id,
          custom_title: nickname
        });

        if (res.ok) {
          return await sendMessage(chatId, "✅ لقب برچسب کاربر [" + targetUser.first_name + "](tg://user?id=" + targetUser.id + ") با موفقیت به **" + nickname + "** تغییر یافت و در برچسب پیام‌هایش ثبت شد.", msg.message_id);
        } else {
          return await sendMessage(chatId, "⚠️ لقب ذخیره شد اما ربات دسترسی کافی برای تنظیم برچسب این کاربر را در تلگرام ندارد (ربات باید دسترسی Add New Admins یا ادمینی کامل داشته باشد).", msg.message_id);
        }
      }
    }

    if (userIsAdmin && (text === "حذف لقب" || text.startsWith("حذف لقب "))) {
      let targetUser = msg.from;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }

      if (g.nicknames[targetUser.id]) {
        delete g.nicknames[targetUser.id];
        await saveGroupData(env, chatId, g);

        await tgCall("setChatAdministratorCustomTitle", {
          chat_id: chatId,
          user_id: targetUser.id,
          custom_title: ""
        });

        return await sendMessage(chatId, "✅ لقب کاربر [" + targetUser.first_name + "](tg://user?id=" + targetUser.id + ") با موفقیت حذف شد.", msg.message_id);
      }
    }

    if (text === "لقب" || text.startsWith("لقب ")) {
      let targetUser = msg.from;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }

      const nick = g.nicknames[targetUser.id];
      if (nick) {
        return await sendMessage(chatId, "🏷 لقب کاربر [" + targetUser.first_name + "](tg://user?id=" + targetUser.id + "): **" + nick + "**", msg.message_id);
      } else {
        return await sendMessage(chatId, "لقبی برای این کاربر ثبت نشده است.", msg.message_id);
      }
    }

    if (userIsAdmin && text === "تگ مدیران") {
      let adminTagText = "👑 **تگ مدیران گروه:**\n\n";
      const groupAdmins = g.admins || [];
      groupAdmins.forEach(admId => {
        const detail = g.member_details[admId];
        const admName = detail ? detail.first_name : "مدیر";
        adminTagText += `[${admName}](tg://user?id=${admId}) `;
      });
      return await sendMessage(chatId, adminTagText, msg.message_id);
    }

    if (userIsAdmin && (text === "امار کل" || text === "امار")) {
      const totalMsgs = g.stats.total || 0;
      const todayMsgs = g.stats.today || 0;
      const totalMembers = g.members ? g.members.length : 0;
      const statText = "📊 **آمار فعالیت گروه:**\n\n▫️ **کل اعضا:** " + totalMembers + "\n▫️ **کل پیام‌های پردازش‌شده:** " + totalMsgs + "\n▫️ **پیام‌های امروز:** " + todayMsgs;
      return await sendMessage(chatId, statText, msg.message_id);
    }

    if (userIsAdmin && text === "امار امروز") {
      const todayMsgs = g.stats.today || 0;
      return await sendMessage(chatId, "📊 **تعداد پیام‌های ارسال شده امروز:** " + todayMsgs, msg.message_id);
    }

    if (userIsAdmin && text.startsWith("اد اجباری ")) {
      const numStr = text.replace("اد اجباری ", "").trim();
      const num = parseInt(numStr);
      if (!isNaN(num) && num >= 0) {
        g.req_adds = num;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ شرط اضافه کردن اعضا به **" + num + "** نفر تغییر یافت.", msg.message_id);
      }
    }

    if (userIsAdmin && text === "اد اجباری غیرفعال") {
      g.req_adds = 0;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "✅ شرط اد اجباری با موفقیت غیرفعال شد.", msg.message_id);
    }

    if (userIsAdmin && text.startsWith("تنظیم عضویت اجباری ")) {
      const chUser = text.replace("تنظیم عضویت اجباری ", "").trim();
      if (chUser) {
        if (!g.forced_channels) g.forced_channels = [];
        if (!g.forced_channels.includes(chUser)) g.forced_channels.push(chUser);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کانال **" + chUser + "** به لیست عضویت اجباری اضافه شد.", msg.message_id);
      }
    }

    if (userIsAdmin && text.startsWith("حذف عضویت اجباری ")) {
      const chUser = text.replace("حذف عضویت اجباری ", "").trim();
      if (chUser && g.forced_channels) {
        g.forced_channels = g.forced_channels.filter(c => c !== chUser);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کانال **" + chUser + "** از لیست عضویت اجباری حذف شد.", msg.message_id);
      }
    }

    if (userIsAdmin && text === "لیست عضویت اجباری") {
      const fChs = g.forced_channels || [];
      if (fChs.length === 0) {
        return await sendMessage(chatId, "هیچ کانالی برای عضویت اجباری تنظیم نشده است.", msg.message_id);
      }
      let fChText = "📢 **لیست کانال‌های عضویت اجباری:**\n\n";
      fChs.forEach((c, i) => { fChText += (i + 1) + ". " + c + "\n"; });
      return await sendMessage(chatId, fChText, msg.message_id);
    }

    if (userIsAdmin && text.startsWith("ثبت اصل")) {
      const aslText = text.replace("ثبت اصل", "").trim();
      g.saved_asl = aslText || null;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "✅ اطلاعات اصل گروه ثبت شد.", msg.message_id);
    }

    if (userIsAdmin && text === "حذف اصل") {
      g.saved_asl = null;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "✅ اطلاعات اصل گروه پاک شد.", msg.message_id);
    }

    if (userIsAdmin && text.startsWith("ثبت لینک اینجا")) {
      const linkText = text.replace("ثبت لینک اینجا", "").trim();
      g.saved_link = linkText || null;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "✅ لینک پیام ثبت شد.", msg.message_id);
    }

    if (userIsAdmin && text === "حذف لینک اینجا") {
      g.saved_link = null;
      await saveGroupData(env, chatId, g);
      return await sendMessage(chatId, "✅ لینک ثبت‌شده پاک شد.", msg.message_id);
    }

    if (userIsAdmin && text === "لینک ها") {
      let linksInfo = "🔗 **اطلاعات لینک‌های ثبت‌شده:**\n\n";
      linksInfo += "▫️ **اصل ثبت‌شده:** " + (g.saved_asl || "ندارد") + "\n";
      linksInfo += "▫️ **لینک ثبت‌شده:** " + (g.saved_link || "ندارد");
      return await sendMessage(chatId, linksInfo, msg.message_id);
    }

    if (userIsAdmin && text.startsWith("تنظیم خوشامد ")) {
      const wText = text.replace("تنظیم خوشامد ", "").trim();
      if (wText) {
        g.welcome_text = wText;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ متن خوشامدگویی با موفقیت آپدیت شد.", msg.message_id);
      }
    }

    if (userIsAdmin && text.startsWith("تنظیم اسپم ")) {
      const valStr = text.replace("تنظیم اسپم ", "").trim();
      if (valStr === "غیرفعال") {
        g.spam_limit = 0;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ سیستم ضداسپم غیرفعال شد.", msg.message_id);
      }
      const limit = parseInt(valStr);
      if (!isNaN(limit) && limit > 0) {
        g.spam_limit = limit;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ حد مجاز ارسال پیام (در ۵ ثانیه) به **" + limit + "** تغییر یافت.", msg.message_id);
      }
    }

    if (userIsAdmin && text.startsWith("تنظیم مجازات اسپم ")) {
      const parts = text.split(" ");
      if (parts.length >= 3) {
        const pType = parts[2];
        let pMinutes = 5;
        if (parts.length >= 4) {
          pMinutes = parseInt(parts[3]) || 5;
        }

        if (pType === "سکوت") {
          g.spam_action = { type: "mute", minutes: pMinutes };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات اسپم به **سکوت به مدت " + pMinutes + " دقیقه** تغییر یافت.", msg.message_id);
        } else if (pType === "بن") {
          g.spam_action = { type: "ban" };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات اسپم به **اخراج (بن)** تغییر یافت.", msg.message_id);
        } else if (pType === "اخطار") {
          g.spam_action = { type: "warn" };
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ مجازات اسپم به **دریافت اخطار** تغییر یافت.", msg.message_id);
        }
      }
    }

    if (userIsAdmin && text.startsWith("تنظیم حداکثر اخطار ")) {
      const numStr = text.replace("تنظیم حداکثر اخطار ", "").trim();
      const num = parseInt(numStr);
      if (!isNaN(num) && num > 0) {
        g.max_warns = num;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ حداکثر تعداد اخطار مجاز به **" + num + "** اخطار تغییر یافت.", msg.message_id);
      }
    }

    if (userIsAdmin && text.startsWith("تنظیم مجازات اخطار ")) {
      const actType = text.replace("تنظیم مجازات اخطار ", "").trim();
      if (actType === "بن" || actType === "سکوت") {
        g.warn_action = actType === "بن" ? "ban" : "mute";
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ مجازات رسیدن به حد نصاب اخطار به **" + actType + "** تغییر یافت.", msg.message_id);
      }
    }

    if (userIsAdmin && (text === "پین" || text === "سنجاق")) {
      if (msg.reply_to_message) {
        await tgCall("pinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        return await sendMessage(chatId, "📌 پیام مورد نظر سنجاق شد.", msg.message_id);
      }
    }

    if (userIsAdmin && (text === "انپین" || text === "حذف سنجاق")) {
      await tgCall("unpinChatMessage", { chat_id: chatId });
      return await sendMessage(chatId, "📌 پیام سنجاق شده برداشته شد.", msg.message_id);
    }

    if (userIsAdmin && text === "اخطار") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        const currentWarns = (g.warns[tId] || 0) + 1;
        g.warns[tId] = currentWarns;
        const maxW = g.max_warns || 3;

        if (currentWarns >= maxW) {
          g.warns[tId] = 0;
          await saveGroupData(env, chatId, g);

          if (g.warn_action === "ban") {
            await tgCall("banChatMember", { chat_id: chatId, user_id: tId });
            return await sendMessage(chatId, "⚠️ کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") به دلیل رسیدن به حد نصاب اخطار (" + maxW + "/" + maxW + ") **مسدود (بن)** شد.");
          } else {
            const expireTime = Date.now() + 60 * 60 * 1000;
            g.muted_users[tId] = expireTime;
            await saveGroupData(env, chatId, g);
            await tgCall("restrictChatMember", { chat_id: chatId, user_id: tId, permissions: { can_send_messages: false }, until_date: Math.floor(expireTime / 1000) });
            return await sendMessage(chatId, "🔇 کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") به دلیل رسیدن به حد نصاب اخطار به مدت **۱ ساعت مسدود** شد.");
          }
        } else {
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "⚠️ یک اخطار به کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") داده شد.\nتعداد اخطارها: **" + currentWarns + "/" + maxW + "**");
        }
      }
    }

    if (userIsAdmin && text === "حذف اخطار") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        const currentWarns = g.warns[tId] || 0;
        if (currentWarns > 0) {
          g.warns[tId] = currentWarns - 1;
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ یک اخطار از کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") کم شد.\nتعداد اخطار فعلی: **" + g.warns[tId] + "/" + (g.max_warns || 3) + "**");
        } else {
          return await sendMessage(chatId, "این کاربر هیچ اخطاری ندارد.", msg.message_id);
        }
      }
    }

    if (userIsAdmin && (text === "سکوت" || text.startsWith("سکوت "))) {
      let targetUser = null;
      let durationMinutes = null;

      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }

      const parts = text.split(" ");
      if (parts.length >= 2) {
        const mins = parseInt(parts[1]);
        if (!isNaN(mins) && mins > 0) durationMinutes = mins;
      }

      if (targetUser) {
        const tId = String(targetUser.id);
        const expireTime = durationMinutes ? Date.now() + durationMinutes * 60 * 1000 : "perm";
        g.muted_users[tId] = expireTime;
        await saveGroupData(env, chatId, g);

        const payload = { chat_id: chatId, user_id: tId, permissions: { can_send_messages: false } };
        if (durationMinutes) payload.until_date = Math.floor(expireTime / 1000);

        await tgCall("restrictChatMember", payload);

        const muteMsg = durationMinutes ?
          "🔇 کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") به مدت **" + durationMinutes + " دقیقه** به حالت سکوت رفت." :
          "🔇 کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") به حالت سکوت دائمی رفت.";
        return await sendMessage(chatId, muteMsg);
      }
    }

    if (userIsAdmin && text === "حذف سکوت") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        delete g.muted_users[tId];
        await saveGroupData(env, chatId, g);

        await tgCall("restrictChatMember", {
          chat_id: chatId,
          user_id: tId,
          permissions: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true
          }
        });

        return await sendMessage(chatId, "🔊 کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") از حالت سکوت خارج شد.");
      }
    }

    if (userIsAdmin && text === "لیست سکوت") {
      const mutedList = Object.keys(g.muted_users || {});
      if (mutedList.length === 0) {
        return await sendMessage(chatId, "هیچ کاربری در حالت سکوت نیست.", msg.message_id);
      }
      let mutedText = "🔇 **لیست کاربران مسدودشده (سکوت):**\n\n";
      mutedList.forEach((uId, i) => {
        mutedText += (i + 1) + ". آیدی عددی: `" + uId + "` | [لینک](tg://user?id=" + uId + ")\n";
      });
      return await sendMessage(chatId, mutedText, msg.message_id);
    }

    if (userIsAdmin && text === "بن") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        if (!g.banned_users.includes(tId)) g.banned_users.push(tId);
        await saveGroupData(env, chatId, g);

        await tgCall("banChatMember", { chat_id: chatId, user_id: tId });
        return await sendMessage(chatId, "🚫 کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") از گروه بن شد.");
      }
    }

    if (userIsAdmin && text === "حذف بن") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        g.banned_users = g.banned_users.filter(u => u !== tId);
        await saveGroupData(env, chatId, g);

        await tgCall("unbanChatMember", { chat_id: chatId, user_id: tId, only_if_banned: true });
        return await sendMessage(chatId, "🟢 کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") آن‌بن شد.");
      }
    }

    if (userIsAdmin && text === "لیست بن") {
      const bList = g.banned_users || [];
      if (bList.length === 0) {
        return await sendMessage(chatId, "هیچ کاربری در لیست بن وجود ندارد.", msg.message_id);
      }
      let bText = "🚫 **لیست کاربران بن‌شده:**\n\n";
      bList.forEach((uId, i) => {
        bText += (i + 1) + ". آیدی عددی: `" + uId + "` | [لینک](tg://user?id=" + uId + ")\n";
      });
      return await sendMessage(chatId, bText, msg.message_id);
    }

    if (userIsAdmin && text.startsWith("حذف پیام ")) {
      const countStr = text.replace("حذف پیام ", "").trim();
      const count = parseInt(countStr);
      if (!isNaN(count) && count > 0 && count <= 100) {
        const currentMsgId = msg.message_id;
        for (let i = 0; i <= count; i++) {
          await tgCall("deleteMessage", { chat_id: chatId, message_id: currentMsgId - i });
        }
        const delNotice = await sendMessage(chatId, "🧹 تعداد " + count + " پیام پاک‌سازی شد.");
        if (delNotice.ok && delNotice.result && delNotice.result.message_id) {
          setTimeout(async () => {
            await tgCall("deleteMessage", { chat_id: chatId, message_id: delNotice.result.message_id });
          }, 3000);
        }
        return;
      }
    }

    if (userIsAdmin && (text.startsWith("تنظیم قوانین ") || text.startsWith("ثبت قوانین "))) {
      const newRules = text.replace(/^(تنظیم قوانین|ثبت قوانین)\s*/, "").trim();
      if (newRules) {
        g.rules = newRules;
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ قوانین جدید گروه ثبت شد.", msg.message_id);
      }
    }

    if (text === "قوانین") {
      const rulesText = (g.rules && g.rules.trim() !== "") ? g.rules : "قوانینی برای این گروه ثبت نشده است.";
      return await sendMessage(chatId, "📜 **قوانین گروه:**\n\n" + rulesText, msg.message_id);
    }

    if (userIsAdmin && text === "تنظیم مدیر") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        if (!g.admins.includes(tId)) {
          g.admins.push(tId);
          await saveGroupData(env, chatId, g);
          return await sendMessage(chatId, "✅ کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") به لیست مدیران ربات اضافه شد.", msg.message_id);
        } else {
          return await sendMessage(chatId, "این کاربر از قبل مدیر ربات است.", msg.message_id);
        }
      }
    }

    if (userIsAdmin && text === "حذف مدیر") {
      let targetUser = null;
      if (msg.reply_to_message && msg.reply_to_message.from) {
        targetUser = msg.reply_to_message.from;
      }
      if (targetUser) {
        const tId = String(targetUser.id);
        g.admins = g.admins.filter(a => String(a) !== tId);
        await saveGroupData(env, chatId, g);
        return await sendMessage(chatId, "✅ کاربر [" + targetUser.first_name + "](tg://user?id=" + tId + ") از مدیران ربات حذف شد.", msg.message_id);
      }
    }

    if (userIsAdmin && text === "لیست مدیرها") {
      const gAdmins = g.admins || [];
      let admText = "👑 **لیست مدیران ربات در این گروه:**\n\n▫️ **مالک گروه:** `" + (g.adder_id || OWNER_ID) + "`\n\n";
      gAdmins.forEach((aId, i) => {
        admText += (i + 1) + ". آیدی عددی: `" + aId + "` | [لینک](tg://user?id=" + aId + ")\n";
      });
      return await sendMessage(chatId, admText, msg.message_id);
    }

    if (userIsAdmin && (text.startsWith("قفل ") || text.startsWith("بازکردن "))) {
      const isLock = text.startsWith("قفل ");
      const targetStr = text.replace(/^(قفل|بازکردن)\s*/, "").trim();

      if (targetStr.startsWith("گروه")) {
        const parts = targetStr.split(" ");
        if (isLock) {
          let hours = 0;
          if (parts.length >= 2) {
            hours = parseInt(parts[1]) || 0;
          }

          if (hours > 0) {
            g.group_lock_until = Date.now() + hours * 60 * 60 * 1000;
            await saveGroupData(env, chatId, g);
            await updateGroupPermissions(chatId, { text: true, photo: true, video: true, audio: true, sticker: true, location: true, animation: true, link: true });
            return await sendMessage(chatId, "🔒 **گروه با موفقیت به مدت " + hours + " ساعت قفل شد.**", msg.message_id);
          } else {
            g.group_lock_until = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
            await saveGroupData(env, chatId, g);
            await updateGroupPermissions(chatId, { text: true, photo: true, video: true, audio: true, sticker: true, location: true, animation: true, link: true });
            return await sendMessage(chatId, "🔒 **گروه تا زمان بازکردن مجدد قفل شد.**", msg.message_id);
          }
        } else {
          g.group_lock_until = null;
          await saveGroupData(env, chatId, g);
          await updateGroupPermissions(chatId, g.locks);
          return await sendMessage(chatId, "🔓 **گروه با موفقیت باز شد.**", msg.message_id);
        }
      }

      const lockMapping = {
        "متن": "text", "عکس": "photo", "فیلم": "video", "گیف": "animation",
        "استیکر": "sticker", "مکان": "location", "اهنگ": "audio", "لینک": "link",
        "ایدی": "username", "فروارد": "forward", "فارسی": "persian",
        "انگلیسی": "english", "ویرایش": "edit", "هشتگ": "hashtag"
      };

      const lockKey = lockMapping[targetStr];

      if (lockKey) {
        g.locks[lockKey] = isLock;
        await saveGroupData(env, chatId, g);
        await updateGroupPermissions(chatId, g.locks);
        const statusMsg = isLock ? "🔒 قفل **" + targetStr + "** فعال شد." : "🔓 قفل **" + targetStr + "** غیرفعال شد.";
        return await sendMessage(chatId, statusMsg, msg.message_id);
      }
    }

    if (userIsAdmin && (text === "راهنما" || text === "/help")) {
      const helpMsg = getHelpText("main");
      return await sendMessage(chatId, helpMsg, msg.message_id, getHelpKeyboard("main"));
    }

  } catch (e) {
    console.error("HandleUpdate Error:", e);
  }
}
