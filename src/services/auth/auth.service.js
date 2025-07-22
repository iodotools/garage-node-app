const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const { EmailService } = require('../email/email.service');

const prisma = require("../../lib/prisma");

class AuthService {
  constructor() {
    this.emailService = new EmailService();
    this.JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
    this.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key";
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
      where: { name: role },
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
        userLogin: email,
        password: hashedPassword,
        displayName: display_name,
        avatarUrl: avatar_url,
        gender: gender,
        birthDate: formattedBirthDate,
        assetUserId: asset_user_id,
        name,
        userRoles: {
          create: {
            role: {
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
      roles: roles.map((r) => ({ id: r.id_role, name: r.name || "" })),
      permissions: permissions.map((p) => ({ id: p.id_permission, name: p.name || "" })),
    };
  }

  async login(email, password) {
    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
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
      'Your 2FA Code',
      `Your 2FA code is: ${twoFactorToken}`,
      `<h3>Your 2FA code is: ${twoFactorToken}</h3>`
    );

    return { message: '2FA code sent to your email.' };
  }

  async verifyTwoFactorToken(email, token) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('User not found');

    const twoFactorToken = await prisma.twoFactorToken.findFirst({
      where: { user: user.id_user, token: token },
    });

    if (!twoFactorToken) throw new Error('Invalid 2FA token');

    if (new Date(twoFactorToken.expires) < new Date()) {
      throw new Error('2FA token has expired');
    }

    await prisma.twoFactorToken.delete({ where: { id_two_factor_token: twoFactorToken.id_two_factor_token } });

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
    const permissions = roles.flatMap((r) => r.rolePermissions.map((rp) => rp.permissionRelation));

    const payload = {
      sub: user.id_user.toString(),
      roles: roles.map((r) => r.name || ''),
      permissions: permissions.map((p) => p.name || ''),
    };

    const accessToken = jwt.sign(payload, this.JWT_SECRET, { expiresIn: this.JWT_EXPIRES_IN });
    const refreshToken = jwt.sign(payload, this.JWT_REFRESH_SECRET, { expiresIn: this.JWT_REFRESH_EXPIRES_IN });

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
      const permissions = roles.flatMap((r) => r.rolePermissions.map((rp) => rp.permissionRelation));

      const payload = {
        sub: user.id_user.toString(),
        roles: roles.map((r) => r.name || ""),
        permissions: permissions.map((p) => p.name || ""),
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

    const roles = user.userRoles.map((ur) => ur.roleRelation);
    const permissions = roles.flatMap((r) =>
      r.rolePermissions.map((rp) => rp.permissionRelation)
    );

    return {
      id: user.id_user,
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      display_name: user.displayName,
      roles: roles.map((r) => ({ id: r.id_role, name: r.name || "" })),
      permissions: permissions.map((p) => ({ id: p.id_permission, name: p.name || "" })),
    };
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

module.exports = { AuthService };
