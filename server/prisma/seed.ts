import { PrismaClient, UserRole } from '@prisma/client'
import { PasswordService } from '../src/auth/password.service'

const prisma = new PrismaClient()
const passwords = new PasswordService()

async function main() {
  const account = process.env.ROOT_ADMIN_ACCOUNT || 'admin'
  const rawPassword = process.env.ROOT_ADMIN_PASSWORD || 'admin123456'
  const username = process.env.ROOT_ADMIN_NAME || '主账号'
  const existing = await prisma.user.findUnique({ where: { account } })
  const passwordHash = await passwords.hash(rawPassword)
  const passwordCipher = passwords.encryptForDisplay(rawPassword)
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { username, role: UserRole.ROOT_ADMIN, passwordHash, passwordCipher, disabled: false, deletedAt: null }
    })
    return
  }
  await prisma.user.create({
    data: { account, username, role: UserRole.ROOT_ADMIN, passwordHash, passwordCipher }
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
