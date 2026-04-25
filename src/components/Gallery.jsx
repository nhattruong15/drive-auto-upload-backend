export default function Gallery({ images = [] }) {

  if(!images.length){
    return(
      <div className="gallery-empty">
        No images uploaded yet
      </div>
    )
  }

  return (

    <div className="gallery">

      {images.map((img, index) => {

        const url =
          typeof img === "string"
            ? img
            : `https://drive.google.com/uc?id=${img.id}`

        return (

          <div className="gallery-card" key={index}>

            <img src={url} alt="upload"/>

          </div>

        )

      })}

    </div>

  )

}