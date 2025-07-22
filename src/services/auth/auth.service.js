const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");

const prisma = require("../../lib/prisma");

class AuthService {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
    this.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key";
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
    this.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  }

  async register(
    email,
    password,
    name,
    role = "administrator",
    avatar_url,
    display_name,
    gender,
    birth_date,
    asset_user_id
  ) {
    // Check if user exists by userLogin (using email as userLogin)
    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = uuidv4();

    // First, find the default user role (e.g., 'user' role)

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
                id: roleObj.id,
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
      id: user.id,
      email: user.email || "",
      name: user.name,
      roles: roles.map((r) => ({ id: r.id, name: r.name || "" })),
      permissions: permissions.map((p) => ({ id: p.id, name: p.name || "" })),
    };
  }

  async login(email, password) {
    const user = await prisma.user.findUnique({
      where: { email: email },
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

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      throw new Error("Invalid credentials");
    }

    const roles = user.userRoles.map((ur) => ur.roleRelation);
    const permissions = roles.flatMap((r) =>
      r.rolePermissions.map((rp) => rp.permissionRelation)
    );

    const payload = {
      sub: user.id.toString(),
      roles: roles.map((r) => r.name || ""),
      permissions: permissions.map((p) => p.name || ""),
    };

    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    });
    const refreshToken = jwt.sign(payload, this.JWT_REFRESH_SECRET, {
      expiresIn: this.JWT_REFRESH_EXPIRES_IN,
    });

    // Revoke any existing refresh tokens for this user
    await prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    // Store the new refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        createdAt: new Date(),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET);

      // Check if token exists and is not expired in database
      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: parseInt(decoded.sub),
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: {
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
        throw new Error("Invalid refresh token");
      }

      const user = storedToken.user;
      const roles = user.userRoles.map((ur) => ur.roleRelation);
      const permissions = roles.flatMap((r) =>
        r.rolePermissions.map((rp) => rp.permissionRelation)
      );

      const payload = {
        sub: user.id.toString(),
        roles: roles.map((r) => r.name || ""),
        permissions: permissions.map((p) => p.name || ""),
      };

      // Generate new access token
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
      // Find and delete the refresh token
      const token = await prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
        },
      });

      if (token) {
        // Delete the refresh token
        await prisma.refreshToken.delete({
          where: {
            id: token.id,
          },
        });

        // Store access token in revoked tokens
        await prisma.revokedToken.create({
          data: {
            token: accessToken,
            revokedAt: new Date(),
          },
        });
      }
    } catch (error) {
      throw new Error("Error during logout");
    }
  }

  async getUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      display_name: user.displayName,
      roles: roles.map((r) => ({ id: r.id, name: r.name || "" })),
      permissions: permissions.map((p) => ({ id: p.id, name: p.name || "" })),
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
