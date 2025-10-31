const mongoose = require("mongoose");
const fs = require("fs-extra");

// MongoDB VIP Model
const vipUserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});
const vipModel = mongoose.models.vipUsers || mongoose.model("vipUsers", vipUserSchema);

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

// Async getRole: adminBot=2, adminBox=1, VIP=4, normal=0
async function getRole(threadData, senderID) {
  const adminBot = global.GoatBot.config.adminBot || [];
  if (!senderID) return 0;
  const adminBox = threadData?.adminIDs || [];
  if (adminBot.includes(senderID)) return 2;
  if (adminBox.includes(senderID)) return 1;

  // VIP check (MongoDB)
  try {
    if (senderID) {
      const vipInfo = await vipModel.findOne({ uid: senderID });
      if (vipInfo && new Date(vipInfo.expiresAt) > new Date()) return 4;
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
    roleConfig = { onStart: command.config.role };
  } else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
    if (!command.config.role.onStart)
      command.config.role.onStart = 0;
    roleConfig = command.config.role;
  } else {
    roleConfig = { onStart: 0 };
  }
  if (isGroup)
    roleConfig.onStart = threadData.data?.setRole?.[commandName] ?? roleConfig.onStart;

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
  if (infoBannedUser && infoBannedUser.status == true) {
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
      threadData.data?.onlyAdminBox === true
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
    if (infoBannedThread && infoBannedThread.status == true) {
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

    // ====== Get Needed Variables Safely ======
    const threadID = event.threadID;
    const senderID = event.senderID;
    const isGroup = event.isGroup || false;
    const langCode = "en"; // Change if your bot supports multi-lang

    // ThreadData & UserData always defined!
    let threadData = {};
    let userData = {};
    try {
      threadData = await threadsData.get(threadID) || { adminIDs: [], data: {}, banned: {} };
    } catch (e) {
      threadData = { adminIDs: [], data: {}, banned: {} };
    }
    try {
      userData = senderID ? (await usersData.get(senderID)) : {};
      if (!userData) userData = {};
      if (!userData.banned) userData.banned = {};
    } catch (e) {
      userData = { banned: {} };
    }

    // Command name and object
    const commandName = message.commandName || event.commandName || "";
    let command = null;
    if (client && client.currentCommand) {
      command = client.currentCommand;
    } else if (GoatBot && GoatBot.commands && commandName) {
      command = GoatBot.commands.get(commandName);
    }

    // ====== PERMISSION CHECK (VIP, ADMIN, etc.) ======
    if (command) {
      const role = await getRole(threadData, senderID);
      const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
      const needRole = roleConfig.onStart;

      if (needRole > role) {
        if (needRole == 4) {
          return await message.reply("You are not vip user baby 🥹");
        }
        const hideNotiMessage = global.GoatBot?.config?.hideNotiMessage || {};
        if (!hideNotiMessage.needRoleToUseCmd) {
          if (needRole == 1)
            return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
          else if (needRole == 2)
            return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2", commandName));
        }
        return true;
      }
    }

    // ====== IS BANNED/ONLY ADMIN CHECK ======
    // if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;

    // ====== Your event logic here (onStart/onChat/onReply/onReaction etc.) ======
    // Example: if (command && command.onStart) await command.onStart({ event, message, ... });
    // Fill in your own bot logic as needed.
  };
};
