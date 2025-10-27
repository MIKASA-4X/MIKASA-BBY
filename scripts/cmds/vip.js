const header = `👑 𝗠𝗜𝗞𝗔𝗦𝗔 𝗩𝗜𝗣 𝗨𝗦𝗘𝗥𝗦 👑`;
const fs = require("fs");

// Data ফাইলগুলো vip সাবফোল্ডারে
const vipFilePath = __dirname + "/vip/vip.json";
const changelogFilePath = __dirname + "/vip/changelog.json";

// Admin UIDs - শুধু এই ৫ জন add/remove করতে পারবে
const ADMIN_UIDS = [
  "61567256940629",
  "100081317798618",
  "100078639797619",
  "61581271750258",
  "100001946540538"
];

// Load/Save VIP Data
function loadVIPData() {
  try { return JSON.parse(fs.readFileSync(vipFilePath)); } 
  catch { return {}; }
}
function saveVIPData(data) {
  try { fs.writeFileSync(vipFilePath, JSON.stringify(data, null, 2)); } 
  catch (err) { console.error("Error saving VIP data:", err); }
}

// Load Changelog
function loadChangelog() {
  try { return JSON.parse(fs.readFileSync(changelogFilePath)); } 
  catch { return {}; }
}

// Calculate remaining days
function remainingDays(expiresAt) {
  const now = new Date();
  const exp = new Date(expiresAt);
  const diff = exp - now;
  return diff > 0 ? Math.ceil(diff / (1000*60*60*24)) : 0;
}

module.exports = {
  config: {
    name: "vip",
    version: "1.0",
    author: "Saif",
    role: 2,
    category: "Config",
    guide: {
      en: "!vip add <uid> - Add VIP (only admins)\n!vip rm <uid> - Remove VIP (only admins)\n!vip list - Show VIP users\n!vip changelog - Show changelog"
    }
  },

  onStart: async function({ api, event, args, message, usersData }) {
    const subcommand = args[0];
    if (!subcommand) return;

    let vipData = loadVIPData();

    // Remove expired VIPs automatically
    for (let uid of Object.keys(vipData)) {
      if (remainingDays(vipData[uid].expiresAt) <= 0) {
        delete vipData[uid];
      }
    }
    saveVIPData(vipData);

    if (subcommand === "add") {
      if (!ADMIN_UIDS.includes(event.senderID)) 
        return message.reply(`${header}\nOnly admins can add VIPs.`);

      const uidToAdd = args[1];
      if (!uidToAdd) return message.reply(`${header}\nProvide UID to add.`);
      const userData = await usersData.get(uidToAdd);
      if (!userData) return message.reply(`${header}\nUser not found.`);
      const userName = userData.name || "Unknown User";

      const now = new Date();
      const expires = new Date(now.getTime() + 7*24*60*60*1000); // 7 দিন

      vipData[uidToAdd] = {
        name: userName,
        addedAt: now.toISOString(),
        expiresAt: expires.toISOString()
      };
      saveVIPData(vipData);

      message.reply(`${header}\n${userName} (${uidToAdd}) added to VIP for 7 days.`);
      api.sendMessage(`${header}\nCongratulations ${userName}, you are VIP until ${expires.toDateString()}!`, uidToAdd);

    } else if (subcommand === "rm") {
      if (!ADMIN_UIDS.includes(event.senderID)) 
        return message.reply(`${header}\nOnly admins can remove VIPs.`);

      const uidToRemove = args[1];
      if (!uidToRemove || !vipData[uidToRemove]) return message.reply(`${header}\nProvide a valid UID to remove.`);
      const userName = vipData[uidToRemove].name || "Unknown User";

      delete vipData[uidToRemove];
      saveVIPData(vipData);

      message.reply(`${header}\n${userName} (${uidToRemove}) removed from VIP.`);
      api.sendMessage(`${header}\nSorry ${userName}, your VIP status has been revoked.`, uidToRemove);

    } else if (subcommand === "list") {
      // admin check নেই → সবাই দেখতে পারবে
      const vipList = Object.keys(vipData).map(uid => {
        const info = vipData[uid];
        const addedDate = new Date(info.addedAt).toLocaleDateString();
        const expDate = new Date(info.expiresAt).toLocaleDateString();
        const daysLeft = remainingDays(info.expiresAt);
        return `• ${info.name} (${uid})\n  Added: ${addedDate}\n  Expires: ${expDate} (${daysLeft} days left)`;
      });
      message.reply(vipList.length > 0 ? `${header}\n» VIP Users:\n${vipList.join("\n")}` : `${header}\nVIP list is empty.`);

    } else if (subcommand === "changelog") {
      const changelogData = loadChangelog();
      const entries = Object.keys(changelogData).map(v => `Version ${v}: ${changelogData[v]}`);
      message.reply(`${header}\nCurrent Version: ${module.exports.config.version}\nChangelog:\n${entries.join("\n")}`);
    }
  }
};
