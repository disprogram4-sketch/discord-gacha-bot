import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import creds from "./credentials.json" with { type: "json" };

import express from "express";
const app = express();
app.get("/", (req, res) => res.send("GachaBot is alive 💚"));
app.listen(3000, () => console.log("🌐 Web server ready"));

// ================================
// CONFIG
// ================================
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const OWNER_ID = process.env.OWNER_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const GACHA_LIMIT = 5;
const gachaCountPerGuild = new Map();
const userGuildMap = new Map();

// ================================
// รางวัลกาชา 🎁
// ================================
const rewards = [
  { name: "หัวอกเส้นรัฟ ✏️", rate: 50 },
  { name: "ครึ่งตัวเส้นรัฟ 🖋️", rate: 40 },
  { name: "เต็มตัวเส้นรัฟ 🖊️", rate: 10 },
  { name: "เกลือนะจ๊ะ อิอิ 🧂", rate: 10 },
  { name: "หัวอกสีเรียบ 🎨", rate: 5 },
  { name: "เต็มตัวสีเรียบ 🖼️", rate: 2 },
];

// ================================
// เชื่อม Google Sheet
// ================================
const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
await doc.loadInfo();
const sheet = doc.sheetsByIndex[0];

// ✅ เพิ่ม/โหลดแท็บสำหรับนับกาชาต่อเซิร์ฟ (ชื่อ "ServerCount")
let sheetServer = doc.sheetsByTitle["ServerCount"];
if (!sheetServer) {
  sheetServer = await doc.addSheet({
    title: "ServerCount",
    headerValues: ["GuildID", "GachaCount"],
  });
  console.log("🆕 สร้างแท็บ ServerCount ใหม่เรียบร้อย!");
} else {
  console.log("📘 โหลดแท็บ ServerCount สำเร็จ!");
  await sheetServer.loadHeaderRow();
  const rowsAtBoot = await sheetServer.getRows();
  for (const row of rowsAtBoot) {
    const gid = String(row.GuildID || "").trim();
    const count = parseInt(row.GachaCount || 0);
    if (!gid || gid === "GuildID" || isNaN(count)) continue;
    gachaCountPerGuild.set(gid, count);
  }
  console.log(`📊 โหลดค่า GachaCount จาก ServerCount แล้ว (${rowsAtBoot.length} เซิร์ฟ)`);
}

// ================================
// ฟังก์ชันช่วย
// ================================
function randomReward() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const reward of rewards) {
    cumulative += reward.rate;
    if (rand <= cumulative) return reward.name;
  }
  return rewards[rewards.length - 1].name;
}
function normId(v) {
  return String(v ?? "").trim();
}

// ================================
// Discord Client
// ================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================================
// สร้างเมนูปุ่ม + รีเซ็ต
// ================================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const args = msg.content.split(" ");
  const cmd = (args[0] || "").toLowerCase();

  // 🧩 คำสั่งสร้างเมนู
  if (cmd === "!menu" && msg.author.id === OWNER_ID) {
    const embed = new EmbedBuilder()
      .setTitle("💖 กาชาสุ่มงาน ART + ไทป์งานจิบิเส้นรัฟ 💖")
      .setDescription(`
ครั้งละ **1 เหรียญ**  (1 เหรียญ = 50THB)

🎨 **ไทป์งานจิบิเส้นรัฟ**

[ รางวัล ]
• หัวอกเส้นรัฟ (50%)
• ครึ่งตัวเส้นรัฟ (40%)
• เต็มตัวเส้นรัฟ (10%)
• เกลือนะคะ (10%)

[ รางวัลเพิ่มเติม ]
• หัวอกสีเรียบ (5%)
• เต็มตัวสีเรียบ (2%)

หลังจากได้รับรางวัลสามารถเปิด ticket เพื่อแจ้งรายการ, กดกาชา และบรีฟงานได้ทันที 💌

:❀ *ช่องทางการเติมเหรียญ:* ⁠『🍀』ช่องทางการโอนเงิน → <#1428514376998195303>
:❀ *ดูรายละเอียดเพิ่มเติมได้ที่:* ⁠📃┊รายละเอียดก่อนกดกาชา → <#1429514927080476784>
:❀ *หลังจากได้รางวัลเปิด:* ⁠『🎫』ᴛɪᴄᴋᴇᴛ → <#1428514321931042866>
      `);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("gacha").setLabel("🔑 สุ่มของ").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("balance").setLabel("💎 เช็คยอดเงิน").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("slip").setLabel("🪙 เติมเหรียญ").setStyle(ButtonStyle.Success),
    );

    await msg.channel.send({ embeds: [embed], components: [row] });
    await msg.reply("📋 เมนูหลักถูกสร้างแล้ว~ 💞");
  }

  // 🔄 รีเซ็ต
  if (cmd === "!reset") {
    const allowedUsers = [OWNER_ID, "880562159917088810"];
    if (!allowedUsers.includes(msg.author.id))
      return msg.reply("เฉพาะเจ้าของหรือแอดมินที่ได้รับสิทธิ์เท่านั้นจ้า~");

    const guildId = msg.guild?.id || "DM";
    gachaCountPerGuild.set(guildId, 0);

    // 🧹 ลบข้อความผลกาชาในช่องนี้ (ถ้ามี)
    try {
      const fetched = await msg.channel.messages.fetch({ limit: 100 });
      const gachaMessages = fetched.filter(
        (m) => m.author.id === client.user.id && /หมุนกาชาได้/.test(m.content || "")
      );
      for (const [, m] of gachaMessages) await m.delete().catch(() => {});
    } catch (err) {
      console.error("❌ เกิดข้อผิดพลาดระหว่างลบข้อความ:", err);
      await msg.channel.send("⚠️ เคลียร์ข้อความไม่สำเร็จ แต่รีเซ็ตโควต้าหมุนเรียบร้อยแล้วค่ะ~");
    }

    // ✅ อัปเดต ServerCount = 0 (อัปเดตแถวเดิมเท่านั้น)
    await sheetServer.loadHeaderRow();
    const serverRows = await sheetServer.getRows();
    const gidNorm = normId(guildId);
    let foundRow = null;
    for (const r of serverRows) {
      const sgid = normId(r.GuildID);
      if (sgid === gidNorm || sgid == guildId) {
        foundRow = r;
        break;
      }
    }

    if (foundRow) {
      foundRow.GachaCount = 0;
      await foundRow.save();
      await msg.channel.send("🔄 รีเซ็ตจำนวนหมุนของเซิร์ฟนี้กลับเป็น 0 แล้วค่ะ 💫");
      console.log(`♻️ รีเซ็ต GachaCount เซิร์ฟ ${guildId} เป็น 0`);
    } else {
      await sheetServer.addRow({ GuildID: gidNorm, GachaCount: 0 });
      await msg.channel.send("🆕 เพิ่ม Guild ใหม่พร้อมรีเซ็ตค่า 0 แล้วค่ะ 💚");
    }
  }
});

// ================================
/* การตอบเมื่อกดปุ่ม */
// ================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  // ================================
  // 🎰 กาชา
  // ================================
  if (interaction.customId === "gacha") {
    await interaction.deferReply({ ephemeral: false });
    const guildId = interaction.guild?.id || "DM";
    const currentCount = gachaCountPerGuild.get(guildId) || 0;

    // ดึงรายการของผู้ใช้ในเซิร์ฟนี้ (เร็ว ไม่ค้าง)
    const rows = await sheet.getRows();
    const userRows = rows.filter(
      (r) => normId(r.User) === normId(interaction.user.id) && normId(r.GuildID) === normId(guildId)
    );

    if (userRows.length === 0) {
      await interaction.editReply("❌ ยังไม่มีข้อมูลของคุณในระบบ ลองเติมก่อนนะ 💚");
      return;
    }

    const totalCoins = userRows.reduce((sum, r) => sum + (parseInt(r.Coins || 0) || 0), 0);
    if (totalCoins < 1) {
      await interaction.editReply("❌ คุณไม่มีคอยน์เพียงพอ!");
      return;
    }

    if (currentCount >= GACHA_LIMIT) {
      await interaction.editReply("🔒 ครบโควต้า 5 ครั้งแล้ว รอรีเซ็ตก่อนนะ 💚");
      return;
    }

    // หัก 1 คอยน์ ไล่จากบนลงล่าง
    let need = 1;
    for (const r of userRows) {
      if (need <= 0) break;
      const available = parseInt(r.Coins || 0) || 0;
      if (available > 0) {
        const deduct = Math.min(available, need);
        r.Coins = available - deduct;
        await r.save();
        need -= deduct;
      }
    }

    // อัปเดตจำนวนหมุนต่อเซิร์ฟใน ServerCount (อัปเดตแถวเดิม ไม่เพิ่มใหม่)
    await sheetServer.loadHeaderRow();
    const serverRows = await sheetServer.getRows();
    const gidNorm = normId(guildId);
    let foundRow = null;
    for (const r of serverRows) {
      const sgid = normId(r.GuildID);
      if (sgid === gidNorm || sgid == guildId) {
        foundRow = r;
        break;
      }
    }

    let newCount = currentCount + 1;
    if (foundRow) {
      const cur = parseInt(foundRow.GachaCount || 0) || 0;
      foundRow.GachaCount = cur + 1;
      await foundRow.save();
      newCount = cur + 1;
    } else {
      await sheetServer.addRow({ GuildID: gidNorm, GachaCount: 1 });
      newCount = 1;
    }
    gachaCountPerGuild.set(guildId, newCount);

    const reward = randomReward();

    // คำนวณคอยน์คงเหลือจากข้อมูลจริงหลังเซฟ
    const rowsAfter = await sheet.getRows();
    const myRowsAfter = rowsAfter.filter(
      (r) => normId(r.User) === normId(interaction.user.id) && normId(r.GuildID) === gidNorm
    );
    const remaining = myRowsAfter.reduce((s, r) => s + (parseInt(r.Coins || 0) || 0), 0);

    await interaction.editReply(
      `🎲 ${interaction.user} หมุนกาชาได้ **${reward}**\n(หมุนครั้งที่ ${newCount}/${GACHA_LIMIT})\n💰 คอยน์คงเหลือ: ${remaining}`
    );

    if (newCount === GACHA_LIMIT) {
      interaction.channel.send("🔒 ครบ 5 ครั้งแล้ว รอบนี้ถูกล็อกไว้จนกว่าเจ้าของจะรีเซ็ตค่ะ 💚");
    }
  }

  // ================================
  // 💰 เช็คยอดเงิน (Per Server)
  // ================================
  if (interaction.customId === "balance") {
    try {
      await interaction.deferReply({ ephemeral: true });
      const guildId = interaction.guild?.id || "DM";

      const rows = await sheet.getRows();
      const mine = rows.filter(
        (r) => normId(r.User) === normId(interaction.user.id) && normId(r.GuildID) === normId(guildId)
      );
      const total = mine.reduce((s, r) => s + (parseInt(r.Coins || 0) || 0), 0);

      await interaction.editReply(`💰 คุณมีทั้งหมด **${total} coins** ในเซิร์ฟเวอร์นี้ค่ะ 💎`);
    } catch (err) {
      console.error("❌ Balance check error:", err);
      await interaction.editReply("⚠️ เกิดข้อผิดพลาดตอนดึงยอดเงิน ลองใหม่อีกทีนะคะ 💚");
    }
  }

  // ================================
  // 💵 เติมเงิน
  // ================================
  if (interaction.customId === "slip") {
    try {
      const guildId = interaction.guild?.id;
      const guildName = interaction.guild?.name || "Unknown Server";
      userGuildMap.set(interaction.user.id, { guildId, guildName, channelId: interaction.channel.id });

      const dm = await interaction.user.createDM();
      await dm.send(
        `💵 ส่งสลิปสำหรับเซิร์ฟเวอร์: **${guildName}**\n\nพิมพ์ยอดเงิน เช่น \`!slip 100\` พร้อมแนบรูปสลิป 💚`
      );
      await interaction.reply({ content: "📩 ทักไปใน DM แล้วน้า~ ไปเปิดดูได้เลย 💚", ephemeral: true });
    } catch {
      await interaction.reply({
        content:
          "❌ ไม่สามารถส่ง DM ได้! โปรดเปิดรับข้อความส่วนตัวก่อนนะ 💌 (Server Settings → Privacy → Allow DMs)",
        ephemeral: true,
      });
    }
  }
});

// ================================
// เมื่อผู้ใช้ส่งสลิปใน DM
// ================================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type !== 1) return;
  if (!msg.content.startsWith("!slip")) return;

  const args = msg.content.split(" ");
  const amount = parseFloat(args[1]);
  const slip = msg.attachments.first();

  if (!amount || !slip) return msg.reply("❌ โปรดพิมพ์ยอดเงินและแนบรูป เช่น `!slip 100` 💵");

  const userGuildInfo = userGuildMap.get(msg.author.id);
  if (!userGuildInfo) {
    return msg.reply("❌ ไม่พบข้อมูลเซิร์ฟเวอร์ โปรดกดปุ่ม 💵 เติมเงิน ในเซิร์ฟเวอร์ก่อนส่งสลิปนะคะ");
  }

  const { guildId, guildName, channelId } = userGuildInfo;

  await sheet.addRow({
    User: msg.author.id,
    Username: msg.author.username,
    GuildID: guildId,
    GuildName: guildName,
    Coins: 0,
    LastSlip: slip.url,
    Status: "รออนุมัติ",
    Date: new Date().toLocaleString(),
  });

  await msg.reply(`📤 ได้รับสลิปสำหรับ **${guildName}** เรียบร้อย!\nยอด: ${amount} บาท 💚 รอแอดมินตรวจยืนยันนะคะ`);

  try {
    const guild = await client.guilds.fetch(guildId);

    let adminChannel = null;
    if (ADMIN_CHANNEL_ID) {
      try {
        adminChannel = await guild.channels.fetch(ADMIN_CHANNEL_ID);
        console.log(`📩 แจ้งเตือนไปห้องแอดมิน ${adminChannel?.name} (${guild.name})`);
      } catch {
        console.warn("⚠️ ไม่พบห้องแอดมินที่ตั้งไว้ ใช้ห้องที่ผู้ใช้กดแทน");
        adminChannel = await guild.channels.fetch(channelId);
      }
    } else {
      adminChannel = await guild.channels.fetch(channelId);
    }

    if (adminChannel) {
      const embed = new EmbedBuilder()
        .setTitle("💵 มีรายการเติมเงินใหม่เข้ามา!")
        .setDescription(
          `🏢 เซิร์ฟเวอร์: **${guildName}**\n👤 ผู้ใช้: **${msg.author.username}**\n💰 ยอด: **${amount} บาท**\n📅 เวลา: ${new Date().toLocaleString()}`
        )
        .setImage(slip.url)
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_${msg.author.id}_${amount}_${guildId}`).setLabel("✅ ยืนยัน").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_${msg.author.id}_${guildId}`).setLabel("❌ ปฏิเสธ").setStyle(ButtonStyle.Danger)
      );

      await adminChannel.send({ embeds: [embed], components: [row] });
      console.log(`✅ แจ้งเตือนสำเร็จที่: ${guild.name} → ${adminChannel.name}`);
    } else {
      console.error("❌ ไม่พบห้องแอดมินที่กำหนด");
    }

    userGuildMap.delete(msg.author.id);
  } catch (err) {
    console.error("❌ Error sending to admin channel:", err);
    msg.reply("⚠️ ส่งสลิปสำเร็จแล้ว แต่ไม่สามารถแจ้งแอดมินได้ กรุณาติดต่อแอดมินโดยตรง 💬");
  }
});

// ================================
// ปุ่ม "ยืนยัน / ปฏิเสธ" ฝั่งแอดมิน (ใช้ getRows เร็ว ๆ)
// ================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const parts = interaction.customId.split("_");
  const action = parts[0];
  if (!["approve", "reject"].includes(action)) return;

  const userId = parts[1];
  const amount = parts[2];
  const guildId = parts[3] || interaction.guild?.id;

  const rows = await sheet.getRows();
  // หาแถว slip ล่าสุดของ user ใน guild นี้ที่ยัง "รออนุมัติ"
  const candidate = rows
    .filter(
      (r) =>
        normId(r.User) === normId(userId) &&
        normId(r.GuildID) === normId(guildId) &&
        String(r.Status || "").trim() === "รออนุมัติ"
    )
    .pop(); // เอาตัวท้ายสุด (ล่าสุด)

  const user = await client.users.fetch(userId);
  if (!candidate) {
    return interaction.reply({ content: "❌ ไม่พบรายการ หรือถูกยืนยันไปแล้ว", ephemeral: true });
  }

  if (action === "approve") {
    const coins = Math.floor(parseFloat(amount) / 50);
    candidate.Coins = coins;
    candidate.Status = "ยืนยันแล้ว";
    await candidate.save();

    await interaction.update({
      content: `✅ แอดมิน ${interaction.user.username} ยืนยันสลิปของ ${user.username} แล้ว!`,
      components: [],
    });

    await user.send(`💚 ยอด **${amount} บาท** ของคุณได้รับการยืนยันแล้ว! (+${coins} coins) 🎉`);
  }

  if (action === "reject") {
    candidate.Status = "ปฏิเสธ";
    await candidate.save();

    await interaction.update({
      content: `❌ แอดมิน ${interaction.user.username} ปฏิเสธสลิปของ ${user.username}`,
      components: [],
    });

    await user.send(`😢 สลิปของคุณถูกปฏิเสธนะคะ โปรดตรวจสอบแล้วส่งใหม่ 💵`);
  }
});

console.log("🔧 ADMIN_CHANNEL_ID ที่โหลดจาก .env คือ:", process.env.ADMIN_CHANNEL_ID);

// ================================
// Login Discord
// ================================
client.login(process.env.DISCORD_TOKEN);
