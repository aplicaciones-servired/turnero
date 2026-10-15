import { IsNumberString } from "class-validator";

export class GenerateTurnDto {
  @IsNumberString()
  serviceId!: string;
}
