import { MemberRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

export class ProjectRoleQueryDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @Transform(({ value }) => value ?? MemberRole.manager)
  @IsEnum(MemberRole)
  role: MemberRole = MemberRole.manager;
}

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  epochId!: string;

  @IsArray()
  @IsString({ each: true })
  slots!: string[];

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  docId?: string;
}

export class PickSlotDto {
  @IsString()
  @IsNotEmpty()
  slot!: string;
}

export class UpdateTranscriptDto {
  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  recording?: string;
}

export class PrWebhookDto {
  @IsString()
  @IsNotEmpty()
  prId!: string;

  @IsEnum(['opened', 'merged', 'closed'])
  event!: 'opened' | 'merged' | 'closed';

  @IsString()
  @IsNotEmpty()
  taskId!: string;
}
