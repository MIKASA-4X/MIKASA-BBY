const fs = require("fs-extra");
const header = `👑 𝗠𝗜𝗞𝗔𝗦𝗔 𝗩𝗜𝗣 𝗨𝗦𝗘𝗥𝗦 👑`;

const vipFilePath = __dirname + "/vip.json";
const changelogFilePath = __dirname + "/changelog.json";

// 5 admin UIDs
const adminUIDs = [
  "61567256940629",
  "100081317798618",
  "100078639797619",
  "61581271750258",
  "100001946540538"
];

function loadVIPData() {
  try {
    return JSON.parse(fs.readFileSync(vipFilePath, "utf-8"));
  } catch {
    return {};
  }
}

function saveVIPData(data) {
  try {
    fs.writeFileSync(vipFilePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving VIP data:", err);
  }
}

function loadChangelog() {
  try {
    return JSON.parse(fs.readFileSync(changelogFilePath, "utf-8"));
  } catch {
    return {};
  }
}

module.exports = {
  config: {
    name: "vip",
    version: "1.0",
    author: "Saif",
    role: 2,
    category: "Config",
    guide: {
      en: "!vip add <uid> - Add VIP\n!vip rm <uid> - Remove VIP\n!vip list - Show VIP list\n!vip changelog - View changelog"
    }
  },

  onStart: async function({ api, event, args, message, usersData }) {
    const subcommand = args[0];
    if (!subcommand) return;

    let vipData = loadVIPData();
    const senderUID = event.senderID;
    const isAdmin = adminUIDs.includes(senderUID);

    // Add VIP
    if (subcommand === "add") {
      if (!isAdmin) return message.reply(`${header}\n⚠️ Only Admins can add VIP users.`);
      const uidToAdd = args[1];
      if (!uidToAdd) return message.reply(`${header}\nPlease provide a UID to add.`);
      const userData = await usersData.get(uidToAdd);
      if (!userData) return message.reply(`${header}\nUser not found.`);

      const userName = userData.name || "Unknown User";
      const addedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7*24*60*60*1000).toISOString(); // 7 days

      vipData[uidToAdd] = { name: userName, addedAt, expiresAt };
      saveVIPData(vipData);

      message.reply(`${header}\n${userName} (${uidToAdd}) added to VIP. Valid until ${new Date(expiresAt).toLocaleDateString()}`);
      api.sendMessage(`${header}\nCongratulations ${userName}! You are now a VIP. Enjoy!`, uidToAdd);
    }

    // Remove VIP
    else if (subcommand === "rm") {
      if (!isAdmin) return message.reply(`${header}\n⚠️ Only Admins can remove VIP users.`);
      const uidToRemove = args[1];
      if (!uidToRemove || !vipData[uidToRemove]) return message.reply(`${header}\nInvalid UID.`);

      const removedUser = vipData[uidToRemove];
      delete vipData[uidToRemove];
      saveVIPData(vipData);

      message.reply(`${header}\n${removedUser.name} (${uidToRemove}) removed from VIP.`);
      api.sendMessage(`${header}\nSorry ${removedUser.name}, you are no longer VIP.`, uidToRemove);
    }

    // List VIP
    else if (subcommand === "list") {
      const vipList = Object.keys(vipData).map(uid => {
        const info = vipData[uid];
        const daysLeft = Math.ceil((new Date(info.expiresAt) - new Date()) / (1000*60*60*24));
        return `• ${info.name} (${uid})\n  Added: ${new Date(info.addedAt).toLocaleDateString()}\n  Expires: ${new Date(info.expiresAt).toLocaleDateString()} (${daysLeft} days left)`;
      });

      message.reply(`${header}\n${vipList.length > 0 ? "» VIP Users:\n" + vipList.join("\n") : "VIP list is empty."}`);
    }

    // Changelog
    else if (subcommand === "changelog") {
      const changelogData = loadChangelog();
      const changelogEntries = Object.keys(changelogData).filter(v => parseFloat(v) >= 1.0);
      if (changelogEntries.length > 0) {
        const changelogText = changelogEntries.map(v => `Version ${v}: ${changelogData[v]}`).join("\n");
        message.reply(`${header}\nCurrent Version: ${module.exports.config.version}\nChangelog:\n${changelogText}`);
      } else {
        message.reply(`${header}\nCurrent Version: ${module.exports.config.version}\nChangelog: No entries found.`);
      }
    }
  }
};
