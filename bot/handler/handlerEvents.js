const fs = require("fs-extra");
const nullAndUndefined = [undefined, null];

function getType(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

// Get Role (with VIP integration)
function getRole(threadData, senderID) {
    const adminBot = global.GoatBot?.config?.adminBot || [];
    if (!senderID) return 0;
    const adminBox = threadData?.adminIDs || [];
    const vipUsers = global.db?.vipUsers?.map(u => u.userID) || [];
    if (vipUsers.includes(senderID)) return 4; // VIP role = 4
    return adminBot.includes(senderID) ? 2 : adminBox.includes(senderID) ? 1 : 0;
}

// Get text helper
function getText(type, reason, time, targetID, lang) {
    const utils = global.utils;
    if (!utils) return "⚠️ utils not found";
    switch (type) {
        case "userBanned": return utils.getText({ lang, head: "handlerEvents" }, "userBanned", reason, time, targetID);
        case "threadBanned": return utils.getText({ lang, head: "handlerEvents" }, "threadBanned", reason, time, targetID);
        case "onlyAdminBox": return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBox");
        case "onlyAdminBot": return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot");
        default: return "⚠️ Unknown text type";
    }
}

function replaceShortcutInLang(text, prefix, commandName) {
    return text
        .replace(/\{(?:p|prefix)\}/g, prefix)
        .replace(/\{(?:n|name)\}/g, commandName)
        .replace(/\{pn\}/g, `${prefix}${commandName}`);
}

// Role config
function getRoleConfig(utils, command, isGroup, threadData, commandName) {
    let roleConfig = {};
    if (utils.isNumber(command.config.role)) roleConfig.onStart = command.config.role;
    else if (typeof command.config.role === "object" && !Array.isArray(command.config.role)) {
        roleConfig = { ...command.config.role };
        roleConfig.onStart ||= 0;
    } else roleConfig.onStart = 0;

    if (isGroup) roleConfig.onStart = threadData?.data?.setRole?.[commandName] ?? roleConfig.onStart;

    for (const key of ["onChat", "onStart", "onReaction", "onReply"])
        roleConfig[key] ??= roleConfig.onStart;

    return roleConfig;
}

// Ban & admin checks
function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, lang) {
    const config = global.GoatBot?.config || {};
    const adminBot = config.adminBot || [];
    const hideNotiMessage = config.hideNotiMessage || {};

    // user banned
    const infoBannedUser = userData?.banned;
    if (infoBannedUser?.status) {
        const { reason, date } = infoBannedUser;
        if (!hideNotiMessage.userBanned) message.reply(getText("userBanned", reason, date, senderID, lang));
        return true;
    }

    // admin only
    if (config.adminOnly?.enable && !adminBot.includes(senderID) && !(config.adminOnly.ignoreCommand || []).includes(commandName)) {
        if (!hideNotiMessage.adminOnly) message.reply(getText("onlyAdminBot", null, null, null, lang));
        return true;
    }

    if (isGroup) {
        if (threadData?.data?.onlyAdminBox && !threadData.adminIDs?.includes(senderID) &&
            !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)) {
            if (!threadData.data.hideNotiMessageOnlyAdminBox) message.reply(getText("onlyAdminBox", null, null, null, lang));
            return true;
        }

        const infoBannedThread = threadData?.banned;
        if (infoBannedThread?.status) {
            const { reason, date } = infoBannedThread;
            if (!hideNotiMessage.threadBanned) message.reply(getText("threadBanned", reason, date, threadID, lang));
            return true;
        }
    }
    return false;
}

// Create getText2 for command language
function createGetText2(langCode, pathCustomLang, prefix, command) {
    const commandName = command.config.name;
    let customLang = {};
    if (fs.existsSync(pathCustomLang)) customLang = require(pathCustomLang)[commandName]?.text || {};

    return function getText2(key, ...args) {
        let lang = command.langs?.[langCode]?.[key] || customLang[key] || "";
        lang = replaceShortcutInLang(lang, prefix, commandName);
        for (let i = args.length - 1; i >= 0; i--) lang = lang.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
        return lang || `❌ Can't find text "${key}" for ${commandName} in "${langCode}"`;
    };
}

// Main export
module.exports = function (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) {
    return async function (event, message) {
        const { utils, client, GoatBot } = global;
        if (!utils || !GoatBot) return console.error("⚠️ utils or GoatBot missing in globals");

        const { getPrefix, removeHomeDir, log, getTime } = utils;
        const { config, configCommands: { envGlobal, envCommands, envEvents } } = GoatBot;
        const { autoRefreshThreadInfoFirstTime } = config.database || {};
        const { body, messageID, threadID, isGroup } = event;
        if (!threadID) return;

        const senderID = event.userID || event.senderID || event.author;
        let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
        let userData = global.db.allUserData.find(u => u.userID == senderID);

        if (!userData && !isNaN(senderID)) userData = await usersData.create(senderID);
        if (!threadData && !isNaN(threadID)) {
            if (global.temp.createThreadDataError.includes(threadID)) return;
            threadData = await threadsData.create(threadID);
            global.db.receivedTheFirstMessage[threadID] = true;
        } else if (autoRefreshThreadInfoFirstTime && !global.db.receivedTheFirstMessage[threadID]) {
            global.db.receivedTheFirstMessage[threadID] = true;
            await threadsData.refreshInfo(threadID);
        }

        const prefix = getPrefix(threadID);
        const role = getRole(threadData, senderID);

        const parameters = { api, usersData, threadsData, message, event, userModel, threadModel, prefix, dashBoardModel, globalModel, dashBoardData, globalData, envCommands, envEvents, envGlobal, role };

        const langCode = threadData?.data?.lang || config.language || "en";

        // Safe wrapper for command execution
        async function safeCommandRun(command, args, type = "onStart") {
            const commandName = command.config.name;
            const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
            const needRole = roleConfig[type] || roleConfig.onStart;

            if (needRole > role) return;

            const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);

            try {
                if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode)) return;

                if (typeof command[type] === "function") {
                    await command[type]({ ...parameters, args, commandName, getLang: getText2 });
                }
            } catch (err) {
                const time = getTime("DD/MM/YYYY HH:mm:ss");
                log.err(type, `Error running ${type} for ${commandName}`, err);
            }
        }

        // ------------------------ ON START ------------------------
        async function onStart() {
            if (!body || !body.startsWith(prefix)) return;
            const args = body.slice(prefix.length).trim().split(/ +/);
            let commandName = args.shift().toLowerCase();
            let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));

            if (!command) return;
            await safeCommandRun(command, args, "onStart");
        }

        // ------------------------ ON CHAT ------------------------
        async function onChat() {
            const allOnChat = GoatBot.onChat || [];
            for (const key of allOnChat) {
                const command = GoatBot.commands.get(key);
                if (!command) continue;
                await safeCommandRun(command, body?.split(/ +/) || [], "onChat");
            }
        }

        // ------------------------ ON REPLY ------------------------
        async function onReply() {
            if (!event.messageReply) return;
            const Reply = GoatBot.onReply.get(event.messageReply.messageID);
            if (!Reply) return;
            const command = GoatBot.commands.get(Reply.commandName);
            if (!command) return;
            await safeCommandRun(command, body?.split(/ +/) || [], "onReply");
        }

        // ------------------------ ON REACTION ------------------------
        async function onReaction() {
            const Reaction = GoatBot.onReaction.get(messageID);
            if (!Reaction) return;
            const command = GoatBot.commands.get(Reaction.commandName);
            if (!command) return;
            await safeCommandRun(command, [], "onReaction");
        }

        // ------------------------ ON FIRST CHAT ------------------------
        async function onFirstChat() {
            const allOnFirstChat = GoatBot.onFirstChat || [];
            for (const item of allOnFirstChat) {
                if (item.threadIDsChattedFirstTime.includes(threadID)) continue;
                const command = GoatBot.commands.get(item.commandName);
                if (!command) continue;
                item.threadIDsChattedFirstTime.push(threadID);
                await safeCommandRun(command, body?.split(/ +/) || [], "onFirstChat");
            }
        }

        // ------------------------ ON EVENT ------------------------
        async function onEvent() {
            const allOnEvent = GoatBot.onEvent || [];
            for (const key of allOnEvent) {
                const command = GoatBot.commands.get(key);
                if (!command) continue;
                await safeCommandRun(command, [], "onEvent");
            }
        }

        // ------------------------ HANDLER EXPORT ------------------------
        return { onStart, onChat, onReply, onReaction, onFirstChat, onEvent };
    };
};
