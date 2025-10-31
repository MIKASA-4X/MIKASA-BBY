const fs = require("fs-extra");
const mongoose = require("mongoose");

// --- MongoDB VIP Model ---
const vipUserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});
const vipModel = mongoose.models.vipUsers || mongoose.model("vipUsers", vipUserSchema);

const nullAndUndefined = [undefined, null];

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

// --- Async getRole: adminBot=2, adminBox=1, VIP=4, normal=0 ---
async function getRole(threadData, senderID) {
  const adminBot = global.GoatBot.config.adminBot || [];
  if (!senderID) return 0;
  const adminBox = threadData ? threadData.adminIDs || [] : [];
  if (adminBot.includes(senderID)) return 2;
  if (adminBox.includes(senderID)) return 1;
  // VIP CHECK
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
    const { getPrefix, removeHomeDir, log, getTime } = utils;
    const { config, configCommands: { envGlobal, envCommands, envEvents } } = GoatBot;
    const { autoRefreshThreadInfoFirstTime } = config.database;
    let { hideNotiMessage = {} } = config;
    const { body, messageID, threadID, isGroup } = event;
    if (!threadID) return;
    const senderID = event.userID || event.senderID || event.author;

    let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
    let userData = global.db.allUserData.find(u => u.userID == senderID);
    if (!userData && !isNaN(senderID))
      userData = await usersData.create(senderID);
    if (!threadData && !isNaN(threadID)) {
      if (global.temp.createThreadDataError.includes(threadID))
        return;
      threadData = await threadsData.create(threadID);
      global.db.receivedTheFirstMessage[threadID] = true;
    } else {
      if (
        autoRefreshThreadInfoFirstTime === true &&
        !global.db.receivedTheFirstMessage[threadID]
      ) {
        global.db.receivedTheFirstMessage[threadID] = true;
        await threadsData.refreshInfo(threadID);
      }
    }
    if (typeof threadData.settings?.hideNotiMessage == "object")
      hideNotiMessage = threadData.settings.hideNotiMessage;
    const prefix = getPrefix(threadID);

    // ========== VIP/ADMIN PERMISSION FIX ==========
    const role = await getRole(threadData, senderID);

    const parameters = {
      api, usersData, threadsData, message, event,
      userModel, threadModel, prefix, dashBoardModel,
      globalModel, dashBoardData, globalData, envCommands,
      envEvents, envGlobal, role,
      removeCommandNameFromBody: function removeCommandNameFromBody(body_, prefix_, commandName_) {
        if ([body_, prefix_, commandName_].every(x => nullAndUndefined.includes(x)))
          throw new Error("Please provide body, prefix and commandName to use this function, this function without parameters only support for onStart");
        for (let i = 0; i < arguments.length; i++)
          if (typeof arguments[i] != "string")
            throw new Error(`The parameter "${i + 1}" must be a string, but got "${getType(arguments[i])}"`);
        return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
      }
    };
    const langCode = threadData.data?.lang || config.language || "en";

    function createMessageSyntaxError(commandName) {
      message.SyntaxError = async function () {
        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "commandSyntaxError", prefix, commandName));
      };
    }

    // ==== COMMAND CALL ====
    let isUserCallCommand = false;
    async function onStart() {
      if (!body || !body.startsWith(prefix))
        return;
      const dateNow = Date.now();
      const args = body.slice(prefix.length).trim().split(/ +/);
      let commandName = args.shift().toLowerCase();
      let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));
      const aliasesData = threadData.data?.aliases || {};
      for (const cmdName in aliasesData) {
        if (aliasesData[cmdName].includes(commandName)) {
          command = GoatBot.commands.get(cmdName);
          break;
        }
      }
      if (command)
        commandName = command.config.name;
      function removeCommandNameFromBody(body_, prefix_, commandName_) {
        if (arguments.length) {
          if (typeof body_ != "string")
            throw new Error(`The first argument (body) must be a string, but got "${getType(body_)}"`);
          if (typeof prefix_ != "string")
            throw new Error(`The second argument (prefix) must be a string, but got "${getType(prefix_)}"`);
          if (typeof commandName_ != "string")
            throw new Error(`The third argument (commandName) must be a string, but got "${getType(commandName_)}"`);
          return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
        }
        else {
          return body.replace(new RegExp(`^${prefix}(\\s+|)${commandName}`, "i"), "").trim();
        }
      }
      if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
        return;
      if (!command)
        if (!hideNotiMessage.commandNotFound)
          return await message.reply(
            commandName ?
              utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound", commandName, prefix) :
              utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound2", prefix)
          );
        else
          return true;
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
        else {
          return true;
        }
      }
      const time = getTime("DD/MM/YYYY HH:mm:ss");
      isUserCallCommand = true;
      try {
        (async () => {
          const analytics = await globalData.get("analytics", "data", {});
          if (!analytics[commandName])
            analytics[commandName] = 0;
          analytics[commandName]++;
          await globalData.set("analytics", analytics, "data");
        })();
        createMessageSyntaxError(commandName);
        const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
        await command.onStart({
          ...parameters,
          args,
          commandName,
          getLang: getText2,
          removeCommandNameFromBody
        });
        client.countDown[commandName] = client.countDown[commandName] || {};
        client.countDown[commandName][senderID] = dateNow;
        log.info("CALL COMMAND", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
      }
      catch (err) {
        log.err("CALL COMMAND", `An error occurred when calling the command ${commandName}`, err);
        return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
      }
    }

    // Dummy event handlers to fix "is not a function" errors
    async function onAnyEvent() {}
    async function onFirstChat() {}
    async function onChat() {}
    async function onReply() {}
    async function onReaction() {}
    async function onEvent() {}
    async function handlerEvent() {}
    async function presence() {}
    async function read_receipt() {}
    async function typ() {}

    return {
      onStart,
      onAnyEvent,
      onFirstChat,
      onChat,
      onReply,
      onReaction,
      onEvent,
      handlerEvent,
      presence,
      read_receipt,
      typ
    };
  };
};
