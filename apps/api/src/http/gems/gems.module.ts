import { Module } from "@nestjs/common";
import { GemsController } from "./gems.controller.js";
import { MediaController } from "./media.controller.js";

@Module({ controllers: [GemsController, MediaController] })
export class GemsModule {}
