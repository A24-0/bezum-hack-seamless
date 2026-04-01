import { UserRole } from '@prisma/client';

export interface UserEntity {
  id: number;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
