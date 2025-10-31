const mongoose = require("mongoose");
const nullAndUndefined = [undefined, null];

// Your VIP user schema/model (change if your schema/model name is different)
const vipUserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});
const vipModel = mongoose.models.vipUsers || mongoose.model("vipUsers", vipUserSchema);

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

// -------- getRole now async --------
async function getRole(threadData, senderID) {
  const adminBot = global.GoatBot.config.adminBot || [];
  if (!senderID) return 0;
  const adminBox = threadData ? threadData.adminIDs || [] : [];
  if (adminBot.includes(senderID)) return 2;
  if (adminBox.includes(senderID)) return 1;

  // VIP CHECK (role 4)
  try {
    const vipInfo = await vipModel.findOne({ uid: senderID });
    if (vipInfo && new Date(vipInfo.expiresAt) > new Date()) {
      return 4; // VIP
    }
  } catch (err) {}
  return 0;
}

function getText(type, reason, time, targetID, lang) {
  const utils = global.utils;
  if (type == "userBanned")
    return utils.getText({ lang, head: "handlerEvents" }, "userBanned", reason, time, targetID);
  else if (type == "threadBanned")
    return utils.getText({ lang, head: "handlerEvents" }, "threadBanned", reason, time, targetID);
  else if (type == "onlyAdminBox")
    return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBox");
  else if (type == "onlyAdminBot")
    return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot");
}

function replaceShortcutInLang(text, prefix, commandName) {
  return text
    .replace(/\{(?:p|prefix)\}/g, prefix)
    .replace(/\{(?:n|name)\}/g, commandName)
    .replace(/\{pn\}/g, `${prefix}${commandName}`);
}

function getRoleConfig(utils, command, isGroup, threadData, commandName) {
  let roleConfig;
  if (utils.isNumber(command.config.role)) {
    roleConfig = {
      onStart: command.config.role
    };
  }
  else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
    if (!command.config.role.onStart)
      command.config.role.onStart = 0;
    roleConfig = command.config.role;
  }
  else {
    roleConfig = {
      onStart: 0
    };
  }

  if (isGroup)
    roleConfig.onStart = threadData.data.setRole?.[commandName] ?? roleConfig.onStart;

  for (const key of ["onChat", "onStart", "onReaction", "onReply"]) {
    if (roleConfig[key] == undefined)
      roleConfig[key] = roleConfig.onStart;
  }
  return roleConfig;
}

function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, lang) {
  const config = global.GoatBot.config;
  const { adminBot, hideNotiMessage } = config;

  // check if user banned
  const infoBannedUser = userData.banned;
  if (infoBannedUser.status == true) {
    const { reason, date } = infoBannedUser;
    if (hideNotiMessage.userBanned == false)
      message.reply(getText("userBanned", reason, date, senderID, lang));
    return true;
  }

  // check if only admin bot
  if (
    config.adminOnly.enable == true
    && !adminBot.includes(senderID)
    && !config.adminOnly.ignoreCommand.includes(commandName)
  ) {
    if (hideNotiMessage.adminOnly == false)
      message.reply(getText("onlyAdminBot", null, null, null, lang));
    return true;
  }

  // ==========    Check Thread    ========== //
  if (isGroup == true) {
    if (
      threadData.data.onlyAdminBox === true
      && !threadData.adminIDs.includes(senderID)
      && !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)
    ) {
      // check if only admin box
      if (!threadData.data.hideNotiMessageOnlyAdminBox)
        message.reply(getText("onlyAdminBox", null, null, null, lang));
      return true;
    }

    // check if thread banned
    const infoBannedThread = threadData.banned;
    if (infoBannedThread.status == true) {
      const { reason, date } = infoBannedThread;
      if (hideNotiMessage.threadBanned == false)
        message.reply(getText("threadBanned", reason, date, threadID, lang));
      return true;
    }
  }
  return false;
}

function createGetText2(langCode, pathCustomLang, prefix, command) {
  const commandType = command.config.countDown ? "command" : "command event";
  const commandName = command.config.name;
  let customLang = {};
  let getText2 = () => { };
  const fs = require("fs-extra");
  if (fs.existsSync(pathCustomLang))
    customLang = require(pathCustomLang)[commandName]?.text || {};
  if (command.langs || customLang || {}) {
    getText2 = function (key, ...args) {
      let lang = command.langs?.[langCode]?.[key] || customLang[key] || "";
      lang = replaceShortcutInLang(lang, prefix, commandName);
      for (let i = args.length - 1; i >= 0; i--)
        lang = lang.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
      return lang || `❌ Can't find text on language "${langCode}" for ${commandType} "${commandName}" with key "${key}"`;
    };
  }
  return getText2;
}

module.exports = function (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) {
  return async function (event, message) {
    const { utils, client, GoatBot } = global;
    // ... আপনি যেমন command, args, role, ইত্যাদি বের করেন

    // উদাহরণ permission-check অংশ (onStart, onChat, ইত্যাদি):
    // ধরে নিচ্ছি: command, commandName, threadData, senderID, isGroup, langCode, hideNotiMessage এগুলো আগেই ডিক্লেয়ার আছে

    // ... (আপনার আগের কোড)
    // এখানে role async নিতে হবে
    const role = await getRole(threadData, senderID);
    const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
    const needRole = roleConfig.onStart; // বা onChat/onReply/onReaction যেখানে প্রয়োজন

    if (needRole > role) {
      if (needRole == 4) {
        return await message.reply("You are not vip user baby 🥹");
      }
      if (!hideNotiMessage.needRoleToUseCmd) {
        if (needRole == 1)
          return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
        else if (needRole == 2)
          return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2", commandName));
      }
      return true;
    }

    // ... (rest of your event handler logic)
  };
};
