import { MemberRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class ProjectEpochRoleQueryDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  epochId!: string;

  @Transform(({ value }) => value ?? MemberRole.manager)
  @IsEnum(MemberRole)
  role: MemberRole = MemberRole.manager;
}

export class EpochRoleQueryDto {
  @IsString()
  @IsNotEmpty()
  epochId!: string;

  @Transform(({ value }) => value ?? MemberRole.manager)
  @IsEnum(MemberRole)
  role: MemberRole = MemberRole.manager;
}

export class EpochQueryDto {
  @IsString()
  @IsNotEmpty()
  epochId!: string;
}

export class ProjectQueryDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;
}
