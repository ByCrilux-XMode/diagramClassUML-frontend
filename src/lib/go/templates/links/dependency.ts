import * as go from "gojs";
import { INK } from "../../theme";
import { linkEndLabel, linkMidLabel } from "./shared";

export function createDependencyLink(): go.Link {
  return new go.Link({
    routing: go.Routing.Orthogonal,
    corner: 8,
    fromSpot: go.Spot.AllSides,
    toSpot: go.Spot.AllSides,
  })
    .add(
      new go.Shape({
        stroke: INK,
        strokeWidth: 3.8,
        strokeDashArray: [4, 2],
      }),
    )
    .add(
      new go.Shape({
        toArrow: "OpenTriangle",
        scale: 1.4,
        stroke: INK,
        strokeWidth: 1.5,
      }),
    )
    .add(linkEndLabel("from"))
    .add(linkEndLabel("to")).add(linkMidLabel())
    .bind(new go.Binding("opacity", "isGhost", (v) => (v ? 0.45 : 1)))
}