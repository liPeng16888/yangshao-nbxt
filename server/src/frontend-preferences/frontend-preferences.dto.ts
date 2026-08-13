import { IsDefined, IsInt, Min } from 'class-validator'

export class SaveFrontendPreferenceDto {
  @IsDefined()
  value!: unknown

  @IsInt()
  @Min(0)
  baseVersion!: number
}
