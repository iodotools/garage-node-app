const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { EmailService } = require("../email/email.service");

const prisma = require("../../lib/prisma");

// Exportar as chaves para uso em outros arquivos
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key";

class AuthService {
  constructor() {
    this.emailService = new EmailService();
    // Usar as constantes exportadas
    this.JWT_SECRET = JWT_SECRET;
    this.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
    this.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  }

  async register(data) {
    const {
      email,
      password,
      name,
      role = "administrator",
      avatar_url,
      display_name,
      gender,
      birth_date,
      asset_user_id,
    } = data;
    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = uuidv4();

    const roleObj = await prisma.role.findFirst({
      where: { role: role },
    });

    if (!roleObj) {
      throw new Error("Role not found");
    }

    const formattedBirthDate = birth_date.includes("T")
      ? new Date(birth_date)
      : new Date(`${birth_date}T00:00:00.000Z`);

    const user = await prisma.user.create({
      data: {
        uid,
        email,
        user_login: email,
        password: hashedPassword,
        display_name: display_name,
        avatar_url: avatar_url,
        gender: gender,
        birth_date: formattedBirthDate,
        asset_user_id: asset_user_id,
        name: name,
        userRoles: {
          create: {
            roleRelation: {
              connect: {
                id_role: roleObj.id_role,
              },
            },
          },
        },
      },
      include: {
        userRoles: {
          include: {
            roleRelation: {
              include: {
                rolePermissions: {
                  include: {
                    permissionRelation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const roles = user.userRoles.map((ur) => ur.roleRelation);
    const permissions = roles.flatMap((r) =>
      r.rolePermissions.map((rp) => rp.permissionRelation)
    );

    return {
      id: user.id_user,
      email: user.email || "",
      name: user.name,
      roles: roles.map((r) => ({ id: r.id_role, name: r.role || "" })),
      permissions: permissions.map((p) => ({
        id: p.id_permission,
        name: p.permission_name || "",
      })),
    };
  }

  async login(email, password) {
    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      throw new Error("Invalid credentials");
    }

    const twoFactorToken = crypto.randomInt(100_000, 1_000_000).toString();
    const expires = new Date(new Date().getTime() + 15 * 60 * 1000); // 15 minutes

    await prisma.twoFactorToken.deleteMany({ where: { user: user.id_user } });

    await prisma.twoFactorToken.create({
      data: {
        user: user.id_user,
        token: twoFactorToken,
        expires: expires,
      },
    });

    await this.emailService.sendMail(
      user.email,
      "Seu código de verificação",
      `Seu código de verificação é: ${twoFactorToken}`,
      `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Código de Verificação - Garage DM9</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px;">
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="text-align: center; padding-bottom: 30px;">
                                      <svg width="171" height="56" viewBox="0 0 171 56" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.06239 34.4307C5.51674 32.919 3.53634 30.7664 2.1222 27.9728C0.70707 25.1811 0 21.9397 0 18.2496C0 14.5595 0.740788 11.5271 2.22137 8.75133C3.70196 5.97555 5.8073 3.82289 8.53542 2.29334C11.2635 0.764776 14.4429 0 18.0695 0C22.7284 0 26.5712 1.27099 29.6008 3.81397C32.6284 6.35695 34.5255 9.88958 35.2901 14.4099H27.304C26.8379 12.1492 25.7729 10.3383 24.1098 8.97521C22.4448 7.61308 20.4317 6.93053 18.0695 6.93053C14.9744 6.93053 12.5121 7.95287 10.6814 9.99657C8.85177 12.0413 7.93645 14.7923 7.93645 18.2486C7.93645 21.705 8.85177 24.5739 10.6814 26.6512C12.5121 28.7286 14.9744 29.7678 18.0695 29.7678C20.1986 29.7678 21.938 29.1695 23.2857 27.9728C24.6334 26.7761 25.3078 25.2802 25.3078 23.4851H16.0732V16.9529H27.6025C30.2979 16.9529 32.3527 17.6096 33.7678 18.9222C35.182 20.2358 35.89 22.1557 35.89 24.6818V35.8008H29.101V26.3768H29.0018C28.6349 29.535 27.3615 32.0453 25.1828 33.9067C23.0031 35.7681 20.2165 36.6983 16.8229 36.6983C13.4294 36.6983 10.608 35.9425 8.06239 34.4298" fill="black"></path><path d="M122.919 54.5774C120.873 53.6294 119.234 52.3168 118.002 50.6386C116.771 48.9595 116.073 47.0238 115.907 44.8285H123.793C124.025 46.1253 124.691 47.1645 125.789 47.9451C126.887 48.7267 128.25 49.117 129.883 49.117C131.912 49.117 133.517 48.3532 134.699 46.8237C135.881 45.2951 136.604 43.0513 136.871 40.0923C136.938 39.2284 136.971 38.5469 136.971 38.0476C136.539 39.7763 135.556 41.1562 134.026 42.1865C132.495 43.2168 130.564 43.7319 128.236 43.7319C125.907 43.7319 123.651 43.2168 121.771 42.1865C119.891 41.1562 118.418 39.7267 117.354 37.898C116.289 36.0703 115.756 33.976 115.756 31.6153C115.756 29.2546 116.322 27.095 117.453 25.2326C118.584 23.3712 120.156 21.917 122.17 20.8699C124.185 19.8227 126.455 19.2997 128.984 19.2997C132.046 19.2997 134.715 20.0645 136.996 21.593C139.275 23.1226 141.021 25.2921 142.236 28.1005C143.451 30.91 144.059 34.1762 144.059 37.899C144.059 41.6218 143.476 44.7552 142.312 47.4983C141.146 50.2404 139.491 52.3435 137.345 53.8057C135.198 55.2679 132.694 56 129.832 56C127.27 56 124.966 55.5265 122.919 54.5794M133.727 35.7542C134.825 34.724 135.374 33.3787 135.374 31.7154C135.374 30.0521 134.824 28.6989 133.727 27.6518C132.629 26.6047 131.214 26.0816 129.484 26.0816C127.755 26.0816 126.289 26.6047 125.191 27.6518C124.092 28.6989 123.543 30.0373 123.543 31.6659C123.543 33.2945 124.099 34.6824 125.216 35.7295C126.331 36.7766 127.753 37.3006 129.484 37.3006C131.216 37.3006 132.629 36.7855 133.727 35.7542Z" fill="black"></path><path d="M42.9816 34.8795C41.0845 33.666 39.595 31.9799 38.514 29.8183C37.4331 27.6577 36.8916 25.198 36.8916 22.438C36.8916 19.6781 37.4153 17.2857 38.4645 15.1578C39.5127 13.0309 40.9605 11.3765 42.807 10.1967C44.6536 9.01682 46.742 8.4264 49.0715 8.4264C51.0678 8.4264 52.8568 8.85931 54.4375 9.72315C56.0173 10.588 57.1904 11.7351 57.957 13.1636L58.6055 9.37345H64.7956V35.8008H57.1587V33.0587C56.3604 34.2227 55.3022 35.1202 53.9893 35.7513C52.6733 36.3823 51.1511 36.6983 49.4226 36.6983C47.0257 36.6983 44.8797 36.0921 42.9836 34.8785M55.4103 28.1976C56.5746 26.7186 57.1577 24.8156 57.1577 22.4886C57.1577 20.1615 56.5835 18.3328 55.4351 16.9033C54.2868 15.4748 52.7814 14.7596 50.918 14.7596C49.0546 14.7596 47.5899 15.4827 46.4257 16.9281C45.2605 18.3744 44.6783 20.2438 44.6783 22.5381C44.6783 24.8324 45.2605 26.7602 46.4257 28.2224C47.5899 29.6856 49.0884 30.4167 50.918 30.4167C52.7477 30.4167 54.2451 29.6777 55.4103 28.1976Z" fill="black"></path><path d="M91.9668 34.8795C90.0697 33.666 88.5802 31.9799 87.4992 29.8183C86.4183 27.6577 85.8769 25.198 85.8769 22.438C85.8769 19.6781 86.4005 17.2857 87.4497 15.1578C88.4979 13.0309 89.9457 11.3765 91.7922 10.1967C93.6388 9.01682 95.7272 8.4264 98.0567 8.4264C100.053 8.4264 101.842 8.85931 103.423 9.72315C105.002 10.588 106.176 11.7351 106.942 13.1636L107.591 9.37345H113.781V35.8008H106.143V33.0587C105.345 34.2227 104.286 35.1202 102.973 35.7513C101.658 36.3823 100.135 36.6983 98.4068 36.6983C96.0099 36.6983 93.8639 36.0921 91.9678 34.8785M104.396 28.1976C105.56 26.7186 106.143 24.8156 106.143 22.4886C106.143 20.1615 105.569 18.3328 104.42 16.9033C103.272 15.4748 101.767 14.7596 99.9032 14.7596C98.0398 14.7596 96.5751 15.4827 95.4109 16.9281C94.2457 18.3744 93.6635 20.2438 93.6635 22.5381C93.6635 24.8324 94.2457 26.7602 95.4109 28.2224C96.5751 29.6856 98.0736 30.4167 99.9032 30.4167C101.733 30.4167 103.23 29.6777 104.396 28.1976Z" fill="black"></path><path d="M150.958 35.9058C148.812 34.726 147.14 33.0726 145.942 30.9447C144.744 28.8178 144.145 26.3907 144.145 23.6645C144.145 20.9382 144.727 18.4368 145.893 16.2594C147.057 14.083 148.67 12.3949 150.734 11.1982C152.798 10.0015 155.16 9.40317 157.823 9.40317C160.485 9.40317 162.647 9.98567 164.612 11.1487C166.574 12.3127 168.122 13.9661 169.253 16.1098C170.384 18.2536 170.966 20.7559 171 23.6139V25.3089H151.733C151.999 27.1376 152.739 28.5998 153.955 29.6965C155.169 30.7931 156.658 31.3419 158.421 31.3419C159.653 31.3419 160.709 31.0854 161.592 30.5692C162.473 30.0541 163.096 29.3151 163.463 28.3502H170.901C170.168 31.3092 168.696 33.6026 166.483 35.2312C164.269 36.8598 161.549 37.6741 158.322 37.6741C155.559 37.6741 153.105 37.0837 150.959 35.9038M163.164 20.4241C162.797 18.9619 162.147 17.8236 161.217 17.0083C160.285 16.194 159.152 15.7859 157.823 15.7859C156.493 15.7859 155.268 16.2019 154.253 17.0331C153.238 17.8642 152.498 18.9956 152.032 20.4241H163.164Z" fill="black"></path><path d="M68.0226 35.8018V9.37444H74.2117L75.1597 14.7596C76.0255 12.8645 77.2234 11.4271 78.7536 10.4463C80.2838 9.46657 82.1313 8.97522 84.2951 8.97522H85.4425V16.3545H84.2951C81.5997 16.3545 79.4944 16.9945 77.9811 18.2744C76.4658 19.5543 75.7091 21.3246 75.7091 23.5852V35.8018H68.0226Z" fill="black"></path><path d="M124.638 13.1537C124.638 15.2906 122.903 17.0232 120.764 17.0232C118.625 17.0232 116.891 15.2906 116.891 13.1537C116.891 11.0169 118.625 9.2843 120.764 9.2843C122.903 9.2843 124.638 11.0169 124.638 13.1537Z" fill="#FFCE00"></path><path d="M133.855 13.1537C133.855 15.2906 132.121 17.0232 129.982 17.0232C127.843 17.0232 126.109 15.2906 126.109 13.1537C126.109 11.0169 127.844 9.2843 129.982 9.2843C132.12 9.2843 133.855 11.0169 133.855 13.1537Z" fill="#FFCE00"></path><path d="M143.073 13.1537C143.073 15.2906 141.339 17.0232 139.201 17.0232C137.063 17.0232 135.327 15.2906 135.327 13.1537C135.327 11.0169 137.062 9.2843 139.201 9.2843C141.34 9.2843 143.073 11.0169 143.073 13.1537Z" fill="#FFCE00"></path><path d="M124.638 13.1537C124.638 15.2906 122.903 17.0232 120.764 17.0232C118.625 17.0232 116.891 15.2906 116.891 13.1537C116.891 11.0169 118.625 9.2843 120.764 9.2843C122.903 9.2843 124.638 11.0169 124.638 13.1537Z" fill="#FFCE00"></path><path d="M133.855 13.1537C133.855 15.2906 132.121 17.0232 129.982 17.0232C127.843 17.0232 126.109 15.2906 126.109 13.1537C126.109 11.0169 127.844 9.2843 129.982 9.2843C132.12 9.2843 133.855 11.0169 133.855 13.1537Z" fill="#FFCE00"></path><path d="M143.073 13.1537C143.073 15.2906 141.339 17.0232 139.201 17.0232C137.063 17.0232 135.327 15.2906 135.327 13.1537C135.327 11.0169 137.062 9.2843 139.201 9.2843C141.34 9.2843 143.073 11.0169 143.073 13.1537Z" fill="#FFCE00"></path><path d="M5.6893 48.9298C6.86247 48.9298 7.395 49.5262 7.395 50.4395V50.7635C7.395 51.7125 6.85553 52.3099 5.73195 52.3019H4.53697V54.0207H4.12641V48.9298H5.6893ZM4.53697 49.2973V51.9433H5.71707C6.53025 51.9433 6.97651 51.5045 6.97651 50.7645V50.4405C6.97651 49.757 6.57389 49.2973 5.68831 49.2973H4.53697Z" fill="black"></path><path d="M10.137 48.8585C11.2814 48.8585 12.0083 49.6133 12.0083 51.023V51.9938C12.0083 53.4105 11.2745 54.1079 10.1301 54.1079C8.98566 54.1079 8.25876 53.4105 8.25876 51.9938V51.023C8.25876 49.6351 8.9569 48.8585 10.138 48.8585H10.137ZM8.69014 51.0369V51.979C8.69014 53.1222 9.20879 53.7265 10.137 53.7265C11.0652 53.7265 11.5839 53.1291 11.5839 51.979V51.0369C11.5839 49.8867 11.0652 49.2389 10.137 49.2389C9.20879 49.2389 8.69014 49.8937 8.69014 51.0369Z" fill="black"></path><path d="M12.642 48.9298H13.0595L13.9233 53.2371L15.3057 48.9298H15.6299L16.94 53.2797L17.9693 48.9298H18.3799L17.1561 54.0207H16.7743L15.4643 49.6629L14.068 54.0207H13.6793L12.643 48.9298H12.642Z" fill="black"></path><path d="M19.2635 48.9298H22.2504V49.3033H19.673V51.238H21.8756V51.6194H19.673V53.6403H22.3367V54.0217H19.2635V48.9298Z" fill="black"></path><path d="M24.9062 48.9298C26.0506 48.9298 26.5186 49.4192 26.5186 50.2741V50.4534C26.5186 51.1221 26.2023 51.5035 25.6043 51.6689C26.1874 51.7838 26.4175 52.0998 26.4175 52.819V53.7463C26.4175 53.8681 26.4611 53.9622 26.5256 54.0197H26.0644C26.0139 53.9553 25.992 53.8612 25.992 53.7394V52.819C25.992 52.0998 25.6896 51.8631 24.8615 51.8631H23.6239V54.0207H23.2134V48.9298H24.9062ZM23.6249 49.2973V51.5045H24.8705C25.6479 51.5114 26.0942 51.1597 26.0942 50.4623V50.2969C26.0942 49.6569 25.756 49.2973 24.8992 49.2973H23.6249Z" fill="black"></path><path d="M27.5768 48.9298H30.5637V49.3033H27.9863V51.238H30.1889V51.6194H27.9863V53.6403H30.65V54.0217H27.5768V48.9298Z" fill="black"></path><path d="M31.5356 48.9298H32.9755C34.2349 48.9298 34.9698 49.7421 34.9698 51.0151V51.9423C34.9698 53.1578 34.3291 54.0207 33.0191 54.0207H31.5366V48.9298H31.5356ZM33.0042 53.6472C33.9186 53.6472 34.5443 53.0717 34.5443 51.9146V51.0299C34.5443 50.0452 34.0336 49.2973 32.9606 49.2973H31.9461V53.6482H33.0042V53.6472Z" fill="black"></path><path d="M38.1352 54.0207V48.9298H39.7834C40.9347 48.9298 41.3889 49.3607 41.3889 50.1374V50.2672C41.3889 50.8784 41.1152 51.2519 40.547 51.3965C41.1727 51.5332 41.4831 51.8779 41.4831 52.5328V52.7051C41.4831 53.5462 41.0081 54.0207 39.835 54.0207H38.1352ZM39.7983 51.231C40.5827 51.231 40.9784 50.9358 40.9784 50.282V50.174C40.9784 49.5985 40.6472 49.2825 39.7903 49.2825H38.5448V51.231H39.7983ZM39.7983 53.6542C40.7195 53.6542 41.0577 53.3163 41.0577 52.6764V52.5179C41.0577 51.8641 40.6333 51.5827 39.7903 51.5827H38.5448V53.6532H39.7973L39.7983 53.6542Z" fill="black"></path><path d="M42.0147 48.9298H42.4758L43.7858 51.6332L45.1603 48.9298H45.6214L43.9802 52.1157V54.0217H43.5627V52.1018L42.0147 48.9308V48.9298Z" fill="black"></path><path d="M47.2954 53.9821V48.7703H49.2183C50.8208 48.7703 51.9385 49.8273 51.9385 51.346C51.9385 52.8646 50.8208 53.9811 49.2183 53.9811H47.2954V53.9821ZM48.4586 52.9478H49.3006C50.1505 52.9478 50.7465 52.293 50.7465 51.347C50.7465 50.4009 50.1505 49.8055 49.3006 49.8055H48.4586V52.9478Z" fill="black"></path><path d="M52.2072 53.9821V48.7713H53.6303L55.0533 52.5902L56.4695 48.7713H57.8935V53.9821H56.7303V50.7664L55.5303 53.9821H54.5694L53.3695 50.7664V53.9821H52.2072Z" fill="black"></path><path d="M58.1464 52.4485H59.3245C59.392 52.8359 59.75 53.0885 60.2339 53.0885C60.8378 53.0885 61.1948 52.6199 61.2771 51.7412C61.2851 51.6441 61.292 51.5401 61.292 51.4361C61.1651 51.9344 60.703 52.2851 59.988 52.2851C58.8921 52.2851 58.1246 51.5411 58.1246 50.4762C58.1246 49.4112 58.9517 48.6375 60.099 48.6375C61.4923 48.6375 62.3502 49.7391 62.3502 51.4143C62.3502 53.0895 61.5231 54.1168 60.226 54.1168C59.0558 54.1168 58.2287 53.4323 58.1464 52.4495M61.053 50.491C61.053 49.9927 60.695 49.65 60.1734 49.65C59.6518 49.65 59.2868 49.9927 59.2868 50.4841C59.2868 50.9755 59.6597 51.3252 60.1734 51.3252C60.6871 51.3252 61.053 50.9824 61.053 50.491Z" fill="black"></path></svg>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 30px;">
                                        <h1 style="color: #333333; font-size: 24px; margin: 0; text-align: center;">Código de Verificação</h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 30px;">
                                        <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0;">Olá,</p>
                                        <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 20px 0;">Seu código de verificação é:</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 30px; text-align: center;">
                                        <div style="background-color: #f8f9fa; border-radius: 4px; padding: 20px; display: inline-block;">
                                            <span style="color: #333333; font-size: 32px; font-weight: bold; letter-spacing: 5px;">${twoFactorToken}</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 20px 0 0;">Atenciosamente,<br>Equipe Garage - DM9</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
    );

    return { message: "Código de verificação enviado para seu email." };
  }

  async verifyTwoFactorToken(email, token) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("User not found");

    const twoFactorToken = await prisma.twoFactorToken.findFirst({
      where: { user: user.id_user, token: token },
    });

    if (!twoFactorToken) throw new Error("Invalid 2FA token");

    if (new Date(twoFactorToken.expires) < new Date()) {
      throw new Error("2FA token has expired");
    }

    await prisma.twoFactorToken.delete({
      where: { id_two_factor_token: twoFactorToken.id_two_factor_token },
    });

    const userWithRoles = await prisma.user.findUnique({
      where: { id_user: user.id_user },
      include: {
        userRoles: {
          include: {
            roleRelation: {
              include: {
                rolePermissions: {
                  include: {
                    permissionRelation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const roles = userWithRoles.userRoles.map((ur) => ur.roleRelation);
    const permissions = roles.flatMap((r) =>
      r.rolePermissions.map((rp) => rp.permissionRelation)
    );

    const payload = {
      sub: user.id_user.toString(),
      roles: roles.map((r) => r.role || ""),
      permissions: permissions.map((p) => p.permission_name || ""),
    };

    console.log("using:" + this.JWT_SECRET);

    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    });
    const refreshToken = jwt.sign(payload, this.JWT_REFRESH_SECRET, {
      expiresIn: this.JWT_REFRESH_EXPIRES_IN,
    });

    await prisma.refreshToken.deleteMany({
      where: { user: user.id_user },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        refresh_token: refreshToken,
        user: user.id_user,
        created_at: new Date(),
        expires_at: expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET);

      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          refresh_token: refreshToken,
          user: parseInt(decoded.sub),
          expires_at: {
            gt: new Date(),
          },
        },
        include: {
          userRelation: {
            include: {
              userRoles: {
                include: {
                  roleRelation: {
                    include: {
                      rolePermissions: {
                        include: {
                          permissionRelation: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!storedToken) {
        throw new Error("Invalid or expired refresh token");
      }

      const user = storedToken.userRelation;

      const roles = user.userRoles.map((ur) => ur.roleRelation);
      const permissions = roles.flatMap((r) =>
        r.rolePermissions.map((rp) => rp.permissionRelation)
      );

      const payload = {
        sub: user.id_user.toString(),
        roles: roles.map((r) => r.role || ""),
        permissions: permissions.map((p) => p.permission_name || ""),
      };

      const newAccessToken = jwt.sign(payload, this.JWT_SECRET, {
        expiresIn: this.JWT_EXPIRES_IN,
      });

      return { accessToken: newAccessToken };
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  async logout(refreshToken, accessToken) {
    try {
      const token = await prisma.refreshToken.findUnique({
        where: {
          refresh_token: refreshToken,
        },
      });

      if (token) {
        await prisma.refreshToken.delete({
          where: {
            id_refresh_token: token.id_refresh_token,
          },
        });

        await prisma.revokedToken.create({
          data: {
            token: accessToken,
            revoked_at: new Date(),
          },
        });
      }
    } catch (error) {
      throw new Error("Error during logout");
    }
  }

  async getUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id_user: userId },
      include: {
        userRoles: {
          include: {
            roleRelation: {
              include: {
                rolePermissions: {
                  include: {
                    permissionRelation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const { password, ...userWithoutPassword } = user;

    const roles = user.userRoles.map((ur) => ur.roleRelation);
    const permissions = roles.flatMap((r) =>
      r.rolePermissions.map((rp) => rp.permissionRelation)
    );

    return {
      ...userWithoutPassword,
      roles: roles.map((r) => ({ id: r.id_role, name: r.role || "" })),
      permissions: permissions.map((p) => ({
        id: p.id_permission,
        name: p.permission_name || "",
      })),
    };
  }

    async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal that the user does not exist
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(new Date().getTime() + 2 * 60 * 60 * 1000); // 2 hours

    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expires,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await this.emailService.sendMail(
      email,
      "Redefinição de Senha",
      `Clique no link para redefinir sua senha: ${resetLink}`,
      `Clique no link para redefinir sua senha: <a href="${resetLink}">${resetLink}</a>`
    );
  }

  async resetPassword(token, newPassword) {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || new Date(resetToken.expires) < new Date()) {
      throw new Error("Token inválido ou expirado.");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email: resetToken.email },
      data: { password: hashedPassword },
    });

    await prisma.passwordResetToken.delete({ where: { token } });
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id_user: userId } });

    if (!user || !user.password || !(await bcrypt.compare(oldPassword, user.password))) {
      throw new Error("Senha antiga inválida.");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id_user: userId },
      data: { password: hashedPassword },
    });
  }

  async checkEmailExists(email) {
    if (!email) {
      return { exists: false };
    }

    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    return {
      exists: !!user,
      message: user ? true : false,
    };
  }
}

module.exports = { AuthService, JWT_SECRET, JWT_REFRESH_SECRET };
