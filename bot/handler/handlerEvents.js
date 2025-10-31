const mongoose = require("mongoose");
const nullAndUndefined = [undefined, null];

// VIP Model (MongoDB)
const vipUserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});
const vipModel = mongoose.models.vipUsers || mongoose.model("vipUsers", vipUserSchema);

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

// -------- getRole async: supports admin, group admin, VIP --------
async function getRole(threadData, senderID) {
  const adminBot = global.GoatBot.config.adminBot || [];
  if (!senderID) return 0;
  const adminBox = threadData ? threadData.adminIDs || [] : [];
  if (adminBot.includes(senderID)) return 2;
  if (adminBox.includes(senderID)) return 1;
  // VIP CHECK (role 4)
  try {
    const vipInfo = await vipModel.findOne({ uid: senderID });
    if (vipInfo && new Date(vipInfo.expiresAt) > new Date()) return 4;
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
  }
  else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
    if (!command.config.role.onStart)
      command.config.role.onStart = 0;
    roleConfig = command.config.role;
  }
  else {
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

    // ====== Example: Get needed variables from event/context =======
    const threadID = event.threadID;
    const senderID = event.senderID;
    const isGroup = event.isGroup;
    const langCode = "en"; // adjust as per your bot config
    const commandName = message.commandName || event.commandName || "";
    const hideNotiMessage = global.GoatBot?.config?.hideNotiMessage || {};

    // Always get threadData up front so you can pass to getRole and others
    const threadData = await threadsData.get(threadID) || { adminIDs: [], data: {}, banned: {} };
    // For userData, if your bot uses usersData for banned/other info
    const userData = await usersData.get(senderID) || { banned: {} };

    // Suppose you already have command loaded (from your commands map)
    // const command = GoatBot.commands.get(commandName); // <-- Example
    // If you have a dynamic command loader, adjust as needed
    let command = null;
    if (client && client.currentCommand) {
      command = client.currentCommand;
    } else if (GoatBot && GoatBot.commands && commandName) {
      command = GoatBot.commands.get(commandName);
    }

    // ======= PERMISSION CHECK (VIP, ADMIN, etc.) =======
    // Only run permission checks if a command is found
    if (command) {
      const role = await getRole(threadData, senderID);
      const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
      const needRole = roleConfig.onStart;

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
    }

    // ======= IS BANNED/ONLY ADMIN CHECK (optionally run elsewhere) =======
    // if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;

    // ======= Rest of your event logic... =======
    // onStart / onChat / onReply / onReaction / etc...

    // Example: If you have a function for each event type, call here
    // if (command && command.onStart) await command.onStart({ event, message, ... });

    // You must fill in the rest of your business logic as per your bot's requirements.
  };
};
