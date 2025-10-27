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

// Fancy function for bold letters + numbers
function fancy(text) {
  text = text.toString();
  const map = {
    '0':'𝟎','1':'𝟏','2':'𝟐','3':'𝟑','4':'𝟒','5':'𝟓','6':'𝟔','7':'𝟕','8':'𝟖','9':'𝟗',
    'A':'𝐀','B':'𝐁','C':'𝐂','D':'𝐃','E':'𝐄','F':'𝐅','G':'𝐆','H':'𝐇','I':'𝐈','J':'𝐉','K':'𝐊','L':'𝐋','M':'𝐌',
    'N':'𝐍','O':'𝐎','P':'𝐏','Q':'𝐐','R':'𝐑','S':'𝐒','T':'𝐓','U':'𝐔','V':'𝐕','W':'𝐖','X':'𝐗','Y':'𝐘','Z':'𝐙',
    'a':'𝐚','b':'𝐛','c':'𝐜','d':'𝐝','e':'𝐞','f':'𝐟','g':'𝐠','h':'𝐡','i':'𝐢','j':'𝐣','k':'𝐤','l':'𝐥','m':'𝐦',
    'n':'𝐧','o':'𝐨','p':'𝐩','q':'𝐪','r':'𝐫','s':'𝐬','t':'𝐭','u':'𝐮','v':'𝐯','w':'𝐰','x':'𝐱','y':'𝐲','z':'𝐳'
  };
  return text.split('').map(c => map[c] || c).join('');
}

function loadVIPData() {
  try { return JSON.parse(fs.readFileSync(vipFilePath, "utf-8")); }
  catch { return {}; }
}

function saveVIPData(data) {
  try { fs.writeFileSync(vipFilePath, JSON.stringify(data, null, 2), "utf-8"); }
  catch (err) { console.error("Error saving VIP data:", err); }
}

function loadChangelog() {
  try { return JSON.parse(fs.readFileSync(changelogFilePath, "utf-8")); }
  catch { return {}; }
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

      message.reply(`${header}\n${fancy(userName)} (${fancy(uidToAdd)}) added to VIP. Valid until ${fancy(new Date(expiresAt).toLocaleDateString())}`);
      api.sendMessage(`${header}\nCongratulations ${fancy(userName)}! You are now a VIP. Enjoy!`, uidToAdd);
    }

    // Remove VIP
    else if (subcommand === "rm") {
      if (!isAdmin) return message.reply(`${header}\n⚠️ Only Admins can remove VIP users.`);
      const uidToRemove = args[1];
      if (!uidToRemove || !vipData[uidToRemove]) return message.reply(`${header}\nInvalid UID.`);

      const removedUser = vipData[uidToRemove];
      delete vipData[uidToRemove];
      saveVIPData(vipData);

      message.reply(`${header}\n${fancy(removedUser.name)} (${fancy(uidToRemove)}) removed from VIP.`);
      api.sendMessage(`${header}\nSorry ${fancy(removedUser.name)}, you are no longer VIP.`, uidToRemove);
    }

    // List VIP
    else if (subcommand === "list") {
      const vipList = Object.keys(vipData).map((uid, index) => {
        const info = vipData[uid];
        const daysLeft = Math.ceil((new Date(info.expiresAt) - new Date()) / (1000*60*60*24));
        return `${fancy(index+1)}. 𝐍𝐚𝐦𝐞: ${fancy(info.name)} (${fancy(uid)})\n  𝗔𝗱𝗱𝗲𝗱: ${fancy(new Date(info.addedAt).toLocaleDateString())}\n  𝗘𝘅𝗽𝗶𝗿𝗲𝘀: ${fancy(new Date(info.expiresAt).toLocaleDateString())} (${fancy(daysLeft)} 𝗱𝗮𝘆𝘀 𝗹𝗲𝗳𝘁)`;
      });

      message.reply(`${header}\n» 𝗩𝗜𝗣 𝗨𝘀𝗲𝗿𝘀:\n${vipList.length > 0 ? vipList.join("\n") : "VIP list is empty."}`);
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
