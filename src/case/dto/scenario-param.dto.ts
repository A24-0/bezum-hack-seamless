import { IsIn } from 'class-validator';

export class ScenarioParamDto {
  @IsIn(['task-meeting', 'doc-approve', 'pr-sync'])
  type!: 'task-meeting' | 'doc-approve' | 'pr-sync';
}
