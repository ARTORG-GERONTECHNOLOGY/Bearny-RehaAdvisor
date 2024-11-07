import React from "react";
import {Container} from "react-bootstrap";


const Error: React.FC = ()=>{
  return (
    <Container className={"p-3"}>
      <h3 style={{textAlign: "center"}}>{-'Error'}</h3>
    </Container>
  )

}
export default Error;